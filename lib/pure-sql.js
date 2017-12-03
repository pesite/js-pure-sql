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

function _transformPgParameters(template, makeParamFunc) {
    let params = template.params;
    let paramArray = [];
    let dynamicParamArray = [];

    for (let p in params) {
        template.query = template.query.replace(new RegExp(':'+p, 'g'), makeParamFunc(params[p]));
        paramArray.splice(params[p], 0, p);
    }

    for (let p in template.dynamicParams) {
        dynamicParamArray.splice(template.dynamicParams[p], 0, p);
    }

    return {query: template.query, params: paramArray, dynamicParams: dynamicParamArray};
}

function _transformPgTemplate(parsedTemplate) {
    for (let p in parsedTemplate) {
        let transformed = _transformPgParameters(parsedTemplate[p], this.makeParam);
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
                    newParamList.push(self.makeParam(newParamList.length+newParams.length+curParamNum));
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
            obj[param].forEach(function() { newParams.push(self.makeParam(newParams.length+curParamNum)); });
            curParamNum += newParams.length;

            let escapedParam = param.substr(0, param.length-1) + '\\*';
            query = query.replace(new RegExp(':'+escapedParam, 'g'), newParams.join(','));
            params.push(param);
        }
    }

    return new _PGTemplate(query, params);
};

function _makeParam(name) {
    return '$'+name;
}

function _PGTemplater() {}
_PGTemplater.prototype.makeParam = _makeParam;
_PGTemplater.prototype.parse = function(baseTemplates) {return _parse(baseTemplates, sqlPgParser, _transformPgTemplate.bind(this)); };
_PGTemplater.prototype.parseTemplateFiles = function(templatePath, templateExt) { return _parse(_parseTemplates(templatePath, templateExt), sqlPgParser, _transformPgTemplate.bind(this)); };

module.exports = {
    v1: v1PureSql,
    PG: new _PGTemplater()
};