'use strict';

const basicSqlParser = require('../parser/sql-template-basic.js').parser;
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

function _transformPgParameters(template) {
    let params = template.params;
    let paramArray = [];

    for (let p in params) {
        template.query = template.query.replace(new RegExp('\\{'+p+'\\}', 'g'), '$'+params[p]);
        paramArray.splice(params[p], 0, p);
    }

    return {query: template.query, params: paramArray};
}

function _transformPgTemplate(parsedTemplate) {
    for (let p in parsedTemplate) {
        let transformed = _transformPgParameters(parsedTemplate[p]);
        parsedTemplate[p] = new _PGTemplate(transformed.query, transformed.params);
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

function _mapToTemplate(obj, templateParams) {
    return templateParams.map(function(k) { return obj[k]; });
}

function _PGTemplate(query, params) {
    this.query = query;
    this.params = params;
}

function _identity(x) { return x; }

_PGTemplate.prototype.map = function(obj) {
    return _mapToTemplate(obj, this.params);
};
_PGTemplate.prototype.length = function() { return this.query.length; };

module.exports = {
    parse: function(baseTemplates) {return _parse(baseTemplates, basicSqlParser, _identity); },
    parseTemplateFiles: function(templatePath, templateExt) { return _parse(_parseTemplates(templatePath, templateExt), basicSqlParser, _identity); },
    PG: {
        parse: function(baseTemplates) {return _parse(baseTemplates, sqlPgParser, _transformPgTemplate); },
        parseTemplateFiles: function(templatePath, templateExt) { return _parse(_parseTemplates(templatePath, templateExt), sqlPgParser, _transformPgTemplate); }
    }
};