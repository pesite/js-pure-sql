'use strict';

const v1PureSql = require('./pure-sql-v1.js');

const pgTemplate = require('./pgTemplate.js');
const fs = require('fs');

function _hasExt(filePath, fileExt) {
    return filePath.substring(filePath.length-fileExt.length) === fileExt;
}

function _withoutExt(filePath, fileExt) {
    return filePath.substring(0, filePath.length - fileExt.length);
}

function _parse(baseTemplates) {
    let parsed = {};

    for (let t in baseTemplates) {
        let parsedTemplate = _parseTemplate(baseTemplates[t]);

        let namedContexts = pgTemplate.makeNamedContexts(parsedTemplate, this.makeParam, this.repeatingArgs);
        if (namedContexts['']) {
            namedContexts[t] = namedContexts[''];
            delete namedContexts[''];
        }

        for (let ctx in namedContexts) {
            let valuedCtx = pgTemplate.makeValuedContext(namedContexts[ctx]);
            let query = pgTemplate.doReplacements(valuedCtx).query;
            valuedCtx.query = query;
            namedContexts[ctx] = new _PGTemplate(valuedCtx);
        }
        Object.assign(parsed, namedContexts);
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

    return templateFiles;
}

function _parseTemplate(template) {
    return pgTemplate.parseToTokens(template);
}

function _PGTemplate(ctx) {
    this.ctx = ctx;
    this.params = ctx.params;
    this.query = ctx.query;
}

function _resolve(template, obj) {
    return pgTemplate.makeValuedContext(template.ctx, obj);
}

_PGTemplate.prototype.map = function(obj) {
    let resolvedCtx = _resolve(this, obj);
    return resolvedCtx.args;
};
_PGTemplate.prototype.length = function() { return this.query.length; };
_PGTemplate.prototype.mapTemplate = function(obj) {
    let resolvedCtx = _resolve(this, obj);
    return pgTemplate.doReplacements(resolvedCtx);
};
_PGTemplate.prototype.makeTemplate = function(obj) {
    let resolvedCtx = _resolve(this, obj);
    let replaced = pgTemplate.doReplacements(resolvedCtx);
    // TODO: explain this, please
    resolvedCtx.query = replaced.query;
    resolvedCtx.tokens = this.ctx.tokens;
    return new _PGTemplate(resolvedCtx);
};

function _withParam(paramFunc) {
    return new _PGTemplater(paramFunc, this.repeatParam);
}

function _withRepeatingArgs() {
    return new _PGTemplater(this.makeParam, true);
}

function _PGTemplater(paramFunc, repeatingArgs) {
    this.makeParam = paramFunc;
    this.repeatingArgs = repeatingArgs;
}
_PGTemplater.prototype.parse = function(baseTemplates) {
    return _parse.call(this, baseTemplates);
};
_PGTemplater.prototype.parseTemplateFiles = function(templatePath, templateExt) { return _parse.call(this, _parseTemplates(templatePath, templateExt)); };

_PGTemplater.prototype.withParam = _withParam;
_PGTemplater.prototype.withRepeatingArgs = _withRepeatingArgs;

module.exports = {
    v1: v1PureSql,
    PG: new _PGTemplater()
};
