'use strict';

const pureSql = require('../pure-sql.js');

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