'use strict';

const pureSql = require('../pure-sql.js').v1;
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
    const templates = pureSql.parseTemplateFiles(path.resolve(__dirname, './sql-v1'), '.sql');

    expect(templates).toEqual({
        'Here': 'SELECT * FROM here;',
        'more': 'SELECT * FROM evenMore WHERE id = {id};'
    });
});

test('should read Postgresql-compatible files from folder by extension', function() {
    const templates = pureSql.PG.parseTemplateFiles(path.resolve(__dirname, './sql-v1'), '.sql');

    expect(templates.Here).toEqual({
        'query': 'SELECT * FROM here;',
        'params': []
    });
    expect(templates.more).toEqual({
        'query': 'SELECT * FROM evenMore WHERE id = $1;',
        'params': ['id']
    });
});

test('should be able to parse Postgresql-compatible parameterized queries', function() {
    const baseTemplates = {
        base: '-- name: test\nSELECT * FROM me\nWHERE a IN ({paramA}) AND b = {paramB} AND c = ({paramA}, {paramC});'
    };

    const templates = pureSql.PG.parse(baseTemplates);
    expect(templates).toEqual({
        test: {query: 'SELECT * FROM me\nWHERE a IN ($2) AND b = $3 AND c = ($2, $1);', params: ['paramC', 'paramA', 'paramB']}
    });
});

test('should map an object to the parameter array', function() {
    const obj = {
        name: 'testguy',
        id: ['testId', 'testId2'],
        len: 55
    };
    const baseTemplates = {
        base: '-- name: test\nUPDATE someone SET length = {len}, name = {name} WHERE id = {id};'
    };
    const templates = pureSql.PG.parse(baseTemplates);

    const mapped = templates.test.map(obj);
    expect(mapped).toEqual(['testId', 'testId2', 'testguy', 55]);
});

test('should leave out parameters that are marked as unescaped', function() {
    const baseTemplates = {
        base: '-- name: test\nSELECT * FROM {!table}\nWHERE a IN ({paramA}) AND b = {paramB} AND c = ({paramA}, {paramC});'
    };

    const templates = pureSql.PG.parse(baseTemplates);
    expect(templates).toEqual({
        test: {query: 'SELECT * FROM {!table}\nWHERE a IN ($2) AND b = $3 AND c = ($2, $1);', params: ['paramC', 'paramA', 'paramB'], dynamicParams: ['!table']}
    });
});

test('should leave out parameters that are marked as lists', function() {
    const baseTemplates = {
        base: '-- name: test\nSELECT * FROM me\nWHERE a IN ({paramA*}) AND b = {paramB};'
    };

    const templates = pureSql.PG.parse(baseTemplates);
    expect(templates).toEqual({
        test: {query: 'SELECT * FROM me\nWHERE a IN ({paramA*}) AND b = $1;', params: ['paramB'], dynamicParams: ['paramA*']}
    });
});

test('should allow to create templates from dynamic templates', function() {
    const baseTemplates = {
        base: '-- name: test\nSELECT * FROM {!table}\nWHERE a IN ({paramA*}) AND b = {paramB};'
    };

    const templates = pureSql.PG.parse(baseTemplates);
    const specificTemplate = templates.test.makeTemplate({'!table': '"me"', 'paramA*': [1,2,3], 'paramB': 'buh!'});
    expect(specificTemplate).toEqual({
        query: 'SELECT * FROM "me"\nWHERE a IN ($2,$3,$4) AND b = $1;', params: ['paramB', 'paramA*']
    });
});