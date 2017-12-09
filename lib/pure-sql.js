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

function _parse(baseTemplates, sqlParser, transformParsedFunc) {
    let parsed = {};

    for (let t in baseTemplates) {
        let parsedTemplate = _parseTemplate(baseTemplates[t], sqlParser);
        if (typeof(parsedTemplate['']) !== 'undefined') {
            if (parsedTemplate[''].length > 0) {
                parsedTemplate[t] = parsedTemplate[''];
            }
            delete parsedTemplate[''];
        }
        parsedTemplate = transformParsedFunc(parsedTemplate);
        parsed = Object.assign(parsed, parsedTemplate);
    }

    return parsed;
}

function _normalizeParams(params) {
    let paramArray = Object.entries(params)
                     .sort(function(a,b) { return a[1][0] >= b[1][0]; })
                     .map(function(a) { return a[0]; });
    return paramArray.reduce(function(a,b,idx) { a[b] = idx+1; return a; }, {});
}

function _transformPgParameters(template, makeParamFunc, paramNormalizerFunc) {
    let params = template.params;
    let paramArray = [];
    let dynamicParamArray = [];

    let normalizedParams = paramNormalizerFunc(params);
    for (let p in normalizedParams) {
        let nn = normalizedParams[p];

        if (Array.isArray(nn)) {
            template.query = template.query.replace(new RegExp(':'+p, 'g'), makeParamFunc(nn[0], p));
            for (let pn in nn) {
                paramArray.splice(nn[pn], 0, p);
            }
        } else {
            template.query = template.query.replace(new RegExp(':'+p, 'g'), makeParamFunc(nn, p));
            paramArray.splice(normalizedParams[p], 0, p);
        }
    }

    for (let p in template.dynamicParams) {
        dynamicParamArray.splice(template.dynamicParams[p], 0, p);
    }

    return {query: template.query, params: paramArray, dynamicParams: dynamicParamArray};
}

function _transformPgTemplate(parsedTemplate) {
    for (let p in parsedTemplate) {
        let transformed = _transformPgParameters(parsedTemplate[p], this.makeParam, this.argTransformer);
        if (transformed.dynamicParams.length > 0) {
            parsedTemplate[p] = new _PGDynamicTemplate(transformed.query, transformed.params, transformed.dynamicParams, this);
        } else {
            parsedTemplate[p] = new _PGTemplate(transformed.query, transformed.params, this);
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

function _PGTemplate(query, params, parent) {
    this.query = query;
    this.params = params;
    this.makeParam = parent && parent.makeParam || undefined;
}

_PGTemplate.prototype.map = function(obj) {
    return _mapToTemplate(obj, this.params);
};
_PGTemplate.prototype.length = function() { return this.query.length; };
_PGTemplate.prototype.mapTemplate = function(obj) {
    return {query: this.query, args: this.map(obj)};
};

function _PGDynamicTemplate(query, params, dynamicParams, parent) {
    this.query = query;
    this.params = params;
    this.dynamicParams = dynamicParams;
    this.makeParam = parent && parent.makeParam || undefined;
}

_PGDynamicTemplate.prototype.makeTemplate = function(obj) {
    let query = ''+this.query;
    let params = [];
    this.params.forEach(function(p) { params.push(p); });
    let curParamNum = params.length+1;
    let self = this;

    // Generate template from query and dynamic parameters, return a good old template
    for (let p in this.dynamicParams) {
        let param = this.dynamicParams[p];
        if (typeof(obj[param]) === 'undefined') {
            throw new Error('Cannot make template without given parameter: ' + param);
        }

        if (param[0] === '!') {
            query = query.replace(new RegExp(':'+param, 'g'), obj[param]);
        } else if (param.substr(-2) === '**') {
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

            let escapedParam = param.substr(0, param.length-1) + '\\*\\*';
            query = query.replace(new RegExp(':'+escapedParam, 'g'), newParams.join(','));
            params.push(param);
        } else if (param.substr(-1) === '*') {
            let newParams = [];
            obj[param].forEach(function() { newParams.push(self.makeParam(newParams.length+curParamNum, param)); });
            curParamNum += newParams.length;

            let escapedParam = param.substr(0, param.length-1) + '\\*';
            query = query.replace(new RegExp(':'+escapedParam, 'g'), newParams.join(','));
            params.push(param);
        }
    }

    return new _PGTemplate(query, params);
};

_PGDynamicTemplate.prototype.mapTemplate = function(obj) {
    let mappedTemplate = this.makeTemplate(obj);
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
    return this.withArgumentTransformer(function(p) { return p; });
}

function _PGTemplater(paramFunc, argTransformer) {
    this.makeParam = paramFunc;
    this.argTransformer = argTransformer || _normalizeParams;
}
_PGTemplater.prototype.parse = function(baseTemplates) {return _parse(baseTemplates, sqlPgParser, _transformPgTemplate.bind(this)); };
_PGTemplater.prototype.parseTemplateFiles = function(templatePath, templateExt) { return _parse(_parseTemplates(templatePath, templateExt), sqlPgParser, _transformPgTemplate.bind(this)); };

_PGTemplater.prototype.withParam = _withParam;
_PGTemplater.prototype.withArgumentTransformer = _withArgumentTransformer;
_PGTemplater.prototype.withRepeatingArgs = _withRepeatingArgs;

module.exports = {
    v1: v1PureSql,
    PG: new _PGTemplater(_makeParam)
};
