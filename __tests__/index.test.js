'use strict';

const pureSql = require('../lib/pure-sql.js');
const index = require('../index.js');

test('should export pureSql properly', function() {
    expect(index).toEqual(pureSql);
});