'use strict';

const pureSql = require('../pure-sql.js');
const path = require('path');

test('should parse multiple templates from base template files', function() {
    const baseTemplates = {
        base: '-- Some comment\nSELECT * FROM me;\n-- name:  abc\nSELECT * FROM myself\n WHERE test = "1"\n\n----  name :  hey\nSELECT * FROM I\n-- with some comment\nWHERE test = "true";',
        base2: '\n-- name: cool\nSELECT * FROM you;',
        base3: '\n-- somename\nSELECT * FROM theother;'
    };

    const templates = pureSql.parse(baseTemplates);
    expect(templates).toEqual({
        base: 'SELECT * FROM me;',
        abc: 'SELECT * FROM myself\n WHERE test = "1"',
        hey: 'SELECT * FROM I\nWHERE test = "true";',
        cool: 'SELECT * FROM you;',
        base3: 'SELECT * FROM theother;'
    });
});

test('should read files from folder by extension', function() {
    const templates = pureSql.parseTemplates(path.resolve(__dirname, './sql'), '.sql');

    expect(templates).toEqual({
        'Here': 'SELECT * FROM here;',
        'more': 'SELECT * FROM evenMore;'
    });
});

test('should be able to parse Postgresql compatible parameterized queries', function() {
    const baseTemplates = {
        base: '-- name: test\nSELECT * FROM me\nWHERE a = {paramA} AND b = {paramB} AND c = {paramA} AND d = {paramC};'
    };

    const templates = pureSql.parsePg(baseTemplates);
    expect(templates).toEqual({
        test: {query: 'SELECT * FROM me\nWHERE a = $2 AND b = $3 AND c = $2 AND d = $1;', params: ['paramC', 'paramA', 'paramB']}
    });
});