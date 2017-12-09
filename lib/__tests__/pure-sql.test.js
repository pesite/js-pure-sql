'use strict';

const pureSql = require('../pure-sql.js');
const path = require('path');

test('should parse multiple templates from base template files', function() {
    const baseTemplates = {
        base: '-- Some comment\nSELECT * FROM me;\n-- name:  abc\nSELECT * FROM myself\n WHERE test = "1"\n\n----  name :  hey\nSELECT * FROM I\n-- with some comment\nWHERE test = "true";',
        base2: '\n-- name: cool\nSELECT * FROM you;',
        base3: '\n-- somename\nSELECT * FROM theother;'
    };

    const templates = pureSql.PG.parse(baseTemplates);

    expect(templates.base.query).toEqual('SELECT * FROM me;');
    expect(templates.abc.query).toEqual('SELECT * FROM myself\n WHERE test = "1"');
    expect(templates.hey.query).toEqual('SELECT * FROM I WHERE test = "true";');
    expect(templates.cool.query).toEqual('SELECT * FROM you;');
    expect(templates.base3.query).toEqual('SELECT * FROM theother;');
    expect(Object.values(templates).length).toEqual(5);

});

test('should read files from folder by extension', function() {
    const templates = pureSql.PG.parseTemplateFiles(path.resolve(__dirname, './sql'), '.sql');

    expect(templates).toMatchObject({Here: {params: [], query: 'SELECT * FROM here;'}, more: {params: ['id'], query: 'SELECT * FROM evenMore WHERE id = $1;'}});
});

test('should read Postgresql-compatible files from folder by extension', function() {
    const templates = pureSql.PG.parseTemplateFiles(path.resolve(__dirname, './sql'), '.sql');

    expect(templates.Here).toMatchObject({
        'query': 'SELECT * FROM here;',
        'params': []
    });
    expect(templates.more).toMatchObject({params: ['id'], query: 'SELECT * FROM evenMore WHERE id = $1;'});
});

test('should be able to parse Postgresql-compatible parameterized queries', function() {
    const baseTemplates = {
        base: '-- name: test\nSELECT * FROM me\nWHERE a IN (:paramA) AND b = :paramB AND c = (:paramA, :paramC);'
    };

    const templates = pureSql.PG.parse(baseTemplates);
    expect(templates).toMatchObject({
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
        base: '-- name: test\nUPDATE someone SET length = :len, name = :name WHERE id = :id;'
    };
    const templates = pureSql.PG.parse(baseTemplates);

    const mapped = templates.test.map(obj);
    expect(mapped).toEqual(['testId', 'testId2', 'testguy', 55]);
});

test('should map a template into both a query and its arguments', function() {
    const obj = {
        name: 'testguy',
        id: ['testId', 'testId2'],
        len: 55
    };
    const baseTemplates = {
        base: '-- name: test\nUPDATE someone SET length = :len, name = :name WHERE id = :id;'
    };
    const templates = pureSql.PG.parse(baseTemplates);

    const mapped = templates.test.mapTemplate(obj);
    expect(mapped).toEqual({query: 'UPDATE someone SET length = $3, name = $2 WHERE id = $1;', args: ['testId', 'testId2', 'testguy', 55]});
});

test('should leave out parameters that are marked as unescaped', function() {
    const baseTemplates = {
        base: '-- name: test\nSELECT * FROM :!table\nWHERE a IN (:paramA) AND b = :paramB AND c = (:paramA, :paramC);'
    };

    const templates = pureSql.PG.parse(baseTemplates);
    expect(templates).toMatchObject({
        test: {query: 'SELECT * FROM :!table\nWHERE a IN ($2) AND b = $3 AND c = ($2, $1);', params: ['paramC', 'paramA', 'paramB'], dynamicParams: ['!table']}
    });
});

test('should leave out parameters that are marked as lists', function() {
    const baseTemplates = {
        base: '-- name: test\nSELECT * FROM me\nWHERE a IN (:paramA*) AND b = :paramB;'
    };

    const templates = pureSql.PG.parse(baseTemplates);
    expect(templates).toMatchObject({
        test: {query: 'SELECT * FROM me\nWHERE a IN (:paramA*) AND b = $1;', params: ['paramB'], dynamicParams: ['paramA*']}
    });
});

test('should allow to create templates from dynamic templates', function() {
    const baseTemplates = {
        base: '-- name: test\nSELECT * FROM :!table\nWHERE a IN (:paramA*) AND b = :paramB;'
    };

    const templates = pureSql.PG.parse(baseTemplates);
    const specificTemplate = templates.test.makeTemplate({'!table': '"me"', 'paramA*': [1,2,3], 'paramB': 'buh!'});
    expect(specificTemplate).toEqual({
        query: 'SELECT * FROM "me"\nWHERE a IN ($2,$3,$4) AND b = $1;', params: ['paramB', 'paramA*']
    });
});

test('should generate lists of lists, too', function() {
    const baseTemplates = {
        base: '-- name: test\nINSERT INTO :!table\nVALUES :paramA**;'
    };

    const templates = pureSql.PG.parse(baseTemplates);
    const specificTemplate = templates.test.makeTemplate({'!table': '"me"', 'paramA**': [[1,2,3],[3,4,5]]});
    expect(specificTemplate).toEqual({
        query: 'INSERT INTO "me"\nVALUES ($1,$2,$3),($4,$5,$6);', params: ['paramA**']
    });
});

test('should map parameters for lists of lists', function() {
    const baseTemplates = {
        base: '-- name: test\nINSERT INTO :!table\nVALUES :paramA**;'
    };

    let listData = [[1,2,3],[3,4,5]];

    const templates = pureSql.PG.parse(baseTemplates);
    const specificTemplate = templates.test.makeTemplate({'!table': '"me"', 'paramA**': listData});
    expect(specificTemplate).toEqual({
        query: 'INSERT INTO "me"\nVALUES ($1,$2,$3),($4,$5,$6);', params: ['paramA**']
    });
    expect(specificTemplate.map({'paramA**': listData})).toEqual([1,2,3,3,4,5]);
});

test('should allow shorthand for mapping dynamic parameters', function() {
    const baseTemplates = {
        base: '-- name: test\nINSERT INTO :!table\nVALUES :paramA**;'
    };

    let listData = [[1,2,3],[3,4,5]];

    const templates = pureSql.PG.parse(baseTemplates);
    const mappedTemplate = templates.test.mapTemplate({'!table': '"me"', 'paramA**': listData});
    expect(mappedTemplate).toEqual({
        query: 'INSERT INTO "me"\nVALUES ($1,$2,$3),($4,$5,$6);', args: [1,2,3,3,4,5]
    });
});

test('should also allow to change the parameter format', function() {
    const baseTemplates = {
        base: '-- name: test\nSELECT * FROM me\nWHERE a IN (:paramA*) AND b = :paramB;'
    };

    let _makeParam = jest.fn(function() {return '?';});
    const templates = pureSql.PG.withParam(_makeParam).parse(baseTemplates);
    expect(templates).toMatchObject({
        test: {query: 'SELECT * FROM me\nWHERE a IN (:paramA*) AND b = ?;', params: ['paramB'], dynamicParams: ['paramA*']}
    });
});

test('should allow repeating arguments for unnumbered parameters', function() {
    const baseTemplates = {
        base: '-- name: test\nUPDATE me SET id = :id, name = :name WHERE id = :id;'
    };

    let _makeParam = jest.fn(function() {return '?';});
    const templates = pureSql.PG.withParam(_makeParam).withRepeatingArgs().parse(baseTemplates);
    expect(templates).toMatchObject({
        test: {query: 'UPDATE me SET id = ?, name = ? WHERE id = ?;', params: ['id', 'name', 'id']}
    });
});