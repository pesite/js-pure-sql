'use strict';

const v1PureSql = require('./pure-sql-v1.js');

const sqlPgParser = require('../parser/sql-template-pg.js').parser;
const fs = require('fs');

function _hasExt(filePath, fileExt) {
    return filePath.substring(filePath.length-fileExt.length) === fileExt;
}

function _withoutExt(filePath, fileExt) {
    return filePath.substring(0, filePath.length-fileExt.length);
}

function _parse(baseTemplates, sqlParser, transformParsedFunc, ctx) {
    let parsed = {};

    for (let t in baseTemplates) {
        let parsedTemplate = _parseTemplate(baseTemplates[t], sqlParser);
        if (typeof(parsedTemplate['']) !== 'undefined') {
            if (parsedTemplate[''].length > 0) {
                parsedTemplate[t] = parsedTemplate[''];
            }
            delete parsedTemplate[''];
        }
        parsedTemplate = transformParsedFunc(parsedTemplate, ctx);
        parsed = Object.assign(parsed, parsedTemplate);
    }

    return parsed;
}

function _normalizeParams(params, ctxParams) {
    let toNormalize = params;

    if (ctxParams) {
        // Merge, such that ctxParams move before all in params, but order of unaffected params stays the same
        let min = Math.min.apply(null, Object.values(toNormalize).map(function(a) { return a[0]; }));
        Object.assign(toNormalize, Object.entries(ctxParams).reduce(function(a, b) { b[1][0] += min-1; a[b[0]] = b[1]; return a;}, {}));
    }

    let paramArray = Object.entries(toNormalize)
        .sort(function(a,b) { return a[1][0] >= b[1][0]; })
        .map(function(a) { return a[0]; });
    return paramArray.reduce(function(a,b,idx) { a[b] = idx+1; return a; }, {});
}

function _transformPgParameters(template, makeParamFunc, paramNormalizerFunc, ctx) {
    let params = _reverseEntries(template.params);
    let paramArray = [];
    let dynamicParamArray = [];

    let normalizedParams = paramNormalizerFunc(params, ctx && ctx.params || undefined);
    let replacements = {};

    for (let p in normalizedParams) {
        let nn = normalizedParams[p];
        if (Array.isArray(nn)) {
            replacements[p] = function(query) {
                return query.replace(new RegExp(':'+p, 'g'), makeParamFunc(nn[0], p));
            };
            for (let pn in nn) {
                paramArray.splice(nn[pn], 0, p);
            }
        } else {
            replacements[p] = function(query) {
                return query.replace(new RegExp(':'+p, 'g'), makeParamFunc(nn, p));
            };
            paramArray.splice(normalizedParams[p], 0, p);
        }
    }

    // Replace sorted by length, in order to prevent prefix replacements
    let replacementEntries = Object.entries(replacements).sort(function(a, b) {
        return b[0].length - a[0].length;
    });
    for (let i in replacementEntries) {
        template.query = replacementEntries[i][1](template.query);
    }

    let normalizedDynamicParams = paramNormalizerFunc(template.dynamicParams);

    for (let p in normalizedDynamicParams) {
        let nn = normalizedDynamicParams[p];

        if (Array.isArray(nn)) {
            for (let pn in nn) {
                dynamicParamArray.splice(nn[pn], 0, p);
            }
        } else {
            dynamicParamArray.splice(normalizedDynamicParams[p], 0, p);
        }
    }

    // TODO
    for (let gg in template.generators) {
        for (let pp of template.generators[gg].params) {
            if (paramArray.indexOf(pp) <= -1 && pp.indexOf('*') <= -1) {
                paramArray.push(pp);
            }
        }
    }

    return {query: template.query, params: paramArray, dynamicParams: dynamicParamArray, generators: template.generators, ctx: {params: params, dynamicParams: dynamicParamArray}};
}

function _transformPgTemplate(parsedTemplate, ctx) {
    for (let p in parsedTemplate) {
        let transformed = _transformPgParameters(parsedTemplate[p], this.makeParam, this.argTransformer, ctx);
        if (transformed.dynamicParams.length > 0 || Object.keys(transformed.generators).length > 0) {
            parsedTemplate[p] = new _PGDynamicTemplate(transformed.query, transformed.params, transformed.dynamicParams, transformed.generators, transformed.ctx, this);
        } else {
            parsedTemplate[p] = new _PGTemplate(transformed.query, transformed.params, transformed.ctx, this);
        }
    }
    return parsedTemplate;
}

function _parseTemplates(templatePath, templateExt) {
    let templateFiles = {};

    fs.readdirSync(templatePath)
        .forEach(function(filePath) {
            if (_hasExt(filePath, templateExt)) {
                const fileContent = fs.readFileSync(templatePath + '/' + filePath).toString();
                templateFiles[_withoutExt(filePath, templateExt)] = fileContent;
            }
        });

    return templateFiles;
}

function _parseTemplate(template, sqlParser) {
    return sqlParser.parse(template);
}

function _asArray(value) {
    if (Array.isArray(value)) {
        return value;
    } else {
        return [value];
    }
}

function _mapToTemplate(obj, templateParams) {
    let _flattenArray = function(mapped, val) {
        // Reduce two levels
        return mapped.concat(_asArray(val)
                             .reduce(
                                 function(mapped, val) {
                                     return mapped.concat(_asArray(val));
                                 },
                                 []
                             )
                            );
    };

    return templateParams.map(function(k) { return obj[k]; })
        .reduce(_flattenArray, []);
}

function _PGTemplate(query, params, ctx, parent) {
    this.query = query;
    this.params = params;
    this.makeParam = parent && parent.makeParam || undefined;
    this.ctx = ctx;
}

_PGTemplate.prototype.map = function(obj) {
    return _mapToTemplate(obj, this.params);
};
_PGTemplate.prototype.length = function() { return this.query.length; };
_PGTemplate.prototype.mapTemplate = function(obj) {
    return {query: this.query, args: this.map(obj)};
};

function _PGDynamicTemplate(query, params, dynamicParams, generators, ctx, parent) {
    this.query = query;
    this.params = params;
    this.dynamicParams = dynamicParams;
    this.generators = generators;
    this.makeParam = parent && parent.makeParam || undefined;
    this.__parse = parent.parse.bind(parent);
    this.ctx = ctx;
}

_PGDynamicTemplate.prototype.makeTemplate = function(obj, ctx) {
    let query = ''+this.query;
    let params = [];
    this.params.forEach(function(p) { params.push(p); });
    let curParamNum = params.length+1;
    let self = this;

    let replacements = {};
    ctx = ctx || this.ctx || {};
    ctx.replacements = ctx.replacements || {};

    // Generate template from query and dynamic parameters, return a good old template
    for (let p in this.dynamicParams) {
        let param = this.dynamicParams[p];
        if (typeof(obj[param]) === 'undefined') {
            throw new Error('Cannot make template without given parameter: ' + param);
        }

        if (param[0] === '!') {
            replacements[param] = function(query) {
                return query.replace(new RegExp(':'+param, 'g'), obj[param]);
            };
        } else if (param.substr(-2) === '**') { // This cannot be a prefix of something else
            if (ctx.replacements[param]) {
                let escapedParam = param.substr(0, param.length-2) + '\\*\\*';
                query = query.replace(new RegExp(':'+escapedParam, 'g'), ctx.replacements[param]);
                params.push(param);
                continue;
            }

            let newParams = [];
            obj[param].forEach(function(paramList) {
                let newParamList = [];
                paramList.forEach(function() {
                    newParamList.push(self.makeParam(newParamList.length+newParams.length+curParamNum, param));
                });
                curParamNum += newParamList.length - 1;
                newParams.push('(' + newParamList.join(',') + ')');
            });
            curParamNum += newParams.length;

            let escapedParam = param.substr(0, param.length-2) + '\\*\\*';
            ctx.replacements[param] = newParams.join(','); // TODO
            query = query.replace(new RegExp(':'+escapedParam, 'g'), newParams.join(','));
            params.push(param);
        } else if (param.substr(-1) === '*') { // This cannot be a prefix of something else
            if (ctx.replacements[param]) {
                let escapedParam = param.substr(0, param.length-1) + '\\*';
                query = query.replace(new RegExp(':'+escapedParam, 'g'), ctx.replacements[param]);
                params.push(param);
                continue;
            }

            let newParams = [];
            obj[param].forEach(function() { newParams.push(self.makeParam(newParams.length+curParamNum, param)); });
            curParamNum += newParams.length;

            let escapedParam = param.substr(0, param.length-1) + '\\*';
            ctx.replacements[param] = newParams.join(','); // TODO
            query = query.replace(new RegExp(':'+escapedParam, 'g'), newParams.join(','));
            params.push(param);
        }
    }

    // Handle generators
    for (let g in this.generators) {
        let replacementHook = obj[g];

        let replacementResult = replacementHook(obj);
        let partial = replacementResult.partial;

        let preParsed = _parseTemplate(partial, sqlPgParser);

        // TODO: Do the renaming from preparsed
        let partialTemplate = {
            partial: partial.replace(':d', ':a').replace(':e', ':b')
        };
        let partialParsed = this.__parse(partialTemplate, ctx);
        let pp = partialParsed.partial.mapTemplate(obj, ctx);

        let escapedParam = '\\' + g.substr(0, g.length);
        query = query.replace(new RegExp(':'+escapedParam, 'g'), pp.query);
        params = partialParsed.partial.params.concat(params.filter(function(a) { return partialParsed.partial.params.indexOf(a) <= -1; }));
    }

    // Replace the parameter names by their number ordered by length to prevent prefix replacements
    let replacementEntries = Object.entries(replacements).sort(function(a, b) {
        return b[0].length - a[0].length;
    });
    for (let i in replacementEntries) {
        query = replacementEntries[i][1](query);
    }

    return new _PGTemplate(query, params);
};

// Reverse entries of an object, where each value is an array
function _reverseEntries(a) {
    return Object.entries(a)
        .map(function(entry) {
            return [entry[0], entry[1].reverse()];
        })
        .reduce(function(a,b) { a[b[0]] = b[1]; return a; }, {});
}

_PGDynamicTemplate.prototype.mapTemplate = function(obj, ctx) {
    let mappedTemplate = this.makeTemplate(obj, ctx);
    return {query: mappedTemplate.query, args: mappedTemplate.map(obj)};
};

function _makeParam(idx, name) {
    return '$'+idx;
}

function _withParam(paramFunc) {
    return new _PGTemplater(paramFunc, this.repeatParam);
}

function _withArgumentTransformer(transformer) {
    return new _PGTemplater(this.makeParam, transformer);
}

function _withRepeatingArgs() {
    return this.withArgumentTransformer(function(p) { return _reverseEntries(p); });
}

function _PGTemplater(paramFunc, argTransformer) {
    this.makeParam = paramFunc;
    this.argTransformer = argTransformer || _normalizeParams;
}
_PGTemplater.prototype.parse = function(baseTemplates, ctx) {
    ctx = ctx || {};
    return _parse(baseTemplates, sqlPgParser, _transformPgTemplate.bind(this), ctx);
};
_PGTemplater.prototype.parseTemplateFiles = function(templatePath, templateExt) { return _parse(_parseTemplates(templatePath, templateExt), sqlPgParser, _transformPgTemplate.bind(this)); };

_PGTemplater.prototype.withParam = _withParam;
_PGTemplater.prototype.withArgumentTransformer = _withArgumentTransformer;
_PGTemplater.prototype.withRepeatingArgs = _withRepeatingArgs;

module.exports = {
    v1: v1PureSql,
    PG: new _PGTemplater(_makeParam)
};
