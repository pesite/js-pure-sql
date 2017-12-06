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