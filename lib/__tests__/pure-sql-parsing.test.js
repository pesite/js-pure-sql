'use strict';

const pureSql = require('../pure-sql.js');

test('should parse special syntax that might interfere with pure-sql syntax', function() {
    const baseTemplates = {
        base: 'SELECT test::text, :param::text FROM me;'
    };

    const templates = pureSql.PG.parse(baseTemplates);

    expect(templates.base.query).toEqual('SELECT test::text, $1::text FROM me;');
    expect(templates.base.params).toEqual(['param']);
});

test('should parse empty strings without problem', function() {
    const baseTemplates = {
        base: 'SELECT * FROM me WHERE :a IN (\'\', "");'
    };

    const templates = pureSql.PG.parse(baseTemplates);

    expect(templates.base.query).toEqual('SELECT * FROM me WHERE $1 IN (\'\', "");');
    expect(templates.base.params).toEqual(['a']);
});

test('should parse and replace prefixed parameters of each other, too', function() {
    const baseTemplates = {
        base: 'SELECT :a, :createdBy, :valid, :discountPercentage, :serviceFee, :currency, :price, :validUntil, :start, :end, :userId, :locationId, :productId, :created, :updated, :additionalItems FROM t;'
    };

    const templates = pureSql.PG.parse(baseTemplates);
    expect(templates.base.query).toEqual('SELECT $2, $9, $14, $13, $12, $11, $3, $1, $8, $7, $6, $5, $10, $4, $15, $16 FROM t;');
    expect(templates.base.params).toEqual([ 'validUntil',
                                            'a',
                                            'price',
                                            'created',
                                            'locationId',
                                            'userId',
                                            'end',
                                            'start',
                                            'createdBy',
                                            'productId',
                                            'currency',
                                            'serviceFee',
                                            'discountPercentage',
                                            'valid',
                                            'updated',
                                            'additionalItems' ]);
});

test('should parse and replace prefixed dynamic parameters of each other, too', function() {
    const baseTemplates = {
        base: 'SELECT :!added, :!a FROM :!anotherTable;'
    };

    const templates = pureSql.PG.parse(baseTemplates);

    let mapped = templates.base.mapTemplate({'!a': 'test', '!added': 'fest', '!anotherTable': 'blu'});
    expect(mapped.query).toEqual('SELECT fest, test FROM blu;');
});