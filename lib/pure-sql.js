'use strict';

const sqlParser = require('../parser/sql-template.js').parser;

function _parseTemplate(template) {
  return sqlParser.parse(template);
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

module.exports = {
  parse: _parse
};