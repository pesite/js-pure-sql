'use strict';

const sqlParser = require('../parser/sql-template-basic.js').parser;
const sqlPgParser = require('../parser/sql-template-pg.js').parser;
const fs = require('fs');

function _hasExt(filePath, fileExt) {
    return filePath.substring(filePath.length-fileExt.length) === fileExt;
}

function _withoutExt(filePath, fileExt) {
    return filePath.substring(0, filePath.length-fileExt.length);
}

function _parse(baseTemplates) {
    let parsed = {};

    for (let t in baseTemplates) {
        let parsedTemplate = _parseTemplate(baseTemplates[t]);
        if (typeof(parsedTemplate['']) !== 'undefined') {
            if (parsedTemplate[''].length > 0) {
                parsedTemplate[t] = parsedTemplate[''];
            }
            delete parsedTemplate[''];
        }
        parsed = Object.assign(parsed, parsedTemplate);
    }
    return parsed;
}

function _transformParametersPg(template) {
    let params = template.params;
    let paramArray = [];

    for (let p in params) {
        template.query = template.query.replace(new RegExp('\\{'+p+'\\}', 'g'), '$'+params[p]);
        paramArray.splice(params[p], 0, p);
    }

    return {query: template.query, params: paramArray};
}

function _parsePg(baseTemplates) {
    let parsed = {};

    for (let t in baseTemplates) {
        let parsedTemplate = _parsePgTemplate(baseTemplates[t]);
        if (typeof(parsedTemplate['']) !== 'undefined') {
            if (parsedTemplate[''].length > 0) {
                parsedTemplate[t] = parsedTemplate[''];
            }
            delete parsedTemplate[''];
        }
        for (let p in parsedTemplate) {
            parsedTemplate[p] = _transformParametersPg(parsedTemplate[p]);
        }
        parsed = Object.assign(parsed, parsedTemplate);
    }
    return parsed;
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

    return _parse(templateFiles);
}

function _parsePgTemplates(templatePath, templateExt) {
    let templateFiles = {};

    fs.readdirSync(templatePath)
    .forEach(function(filePath) {
        if (_hasExt(filePath, templateExt)) {
            const fileContent = fs.readFileSync(templatePath + '/' + filePath).toString();
            templateFiles[_withoutExt(filePath, templateExt)] = fileContent;
        }
    });

    return _parsePg(templateFiles);
}

function _parseTemplate(template) {
    return sqlParser.parse(template);
}

function _parsePgTemplate(template) {
    return sqlPgParser.parse(template);
}

module.exports = {
    parse: _parse,
    parseTemplates: _parseTemplates,
    parsePg: _parsePg,
    parsePgTemplates: _parsePgTemplates
};