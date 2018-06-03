'use strict';

const pgTemplate = require('../pgTemplate.js');

// TODO: name
test('should replace parameters in tokens', function() {
    const ctx = {
        tokens: [
            ['text', 'SELECT a,b,c FROM '],
            ['replacedParam', '!table'],
            ['text', ' WHERE '],
            ['replacedParam', 'a'],
            ['text', ' >= 5 AND ('],
            ['replacedParam', 'b*'],
            ['text', ') = (4,5,6);']
        ],
        args: [4,5,6,7],
        replacements: {
            'a': '$1',
            'b*': '$2,$3,$4',
            '!table': 'someTable'
        }
    };

    const replaced = pgTemplate.doReplacements(ctx);

    expect(replaced.query).toEqual('SELECT a,b,c FROM someTable WHERE $1 >= 5 AND ($2,$3,$4) = (4,5,6);');
    expect(replaced.args).toEqual([4,5,6,7]);
});

test('should replace starred parameters in token', function() {
    const ctx = {
        tokens: [
            ['text', 'SELECT a,b,c FROM someTable WHERE '],
            ['replacedParam', 'a'],
            ['text', ' >= 5 AND ('],
            ['replacedParam', 'a*'],
            ['text', ') = (4,5,6) OR (6,6,7) IN ('],
            ['replacedParam', 'a**'],
            ['text', ') AND '],
            ['replacedParam', 'a'],
            ['text', ' <= 500;']
        ],
        args: [4,5,6,7],
        replacements: {
            'a': '$1',
            'a*': '$2,$3,$4',
            'a**': '($5,$6,$7),($8,$9,$10)'
        }
    };

    const replaced = pgTemplate.doReplacements(ctx);

    expect(replaced.query).toEqual('SELECT a,b,c FROM someTable WHERE $1 >= 5 AND ($2,$3,$4) = (4,5,6) OR (6,6,7) IN (($5,$6,$7),($8,$9,$10)) AND $1 <= 500;');
    expect(replaced.args).toEqual([4,5,6,7]);
});

test('should create valued context from unvalued context and named values', function() {
    const ctx = {
        tokens: [
            ['text', 'SELECT * FROM '],
            ['param', '!table'],
            ['text', ' WHERE '],
            ['param', 'a'],
            ['text', ' > 5 AND '],
            ['generator', {name: '*gen', params: ['a']}],
            ['text', ' AND '],
            ['generator', {name: '*gen', params: ['a']}],
            ['text', ';']
        ]
    };
    const _hook = function(c) {
        if (c > 5) {
            return {partial: ':c < 500 AND :c > 5 OR :d <= 17'};
        } else {
            return {partial: ':c < 5 OR :d > 17'};
        }
    };
    const params = {
        '!table': 'weird',
        'a': 3,
        'd': 13,
        '*gen': _hook
    };

    const valuedCtx = pgTemplate.makeValuedContext(ctx, params);

    expect(valuedCtx.query).toEqual('SELECT * FROM :!table WHERE :a > 5 AND :a < 5 OR :d > 17 AND :a < 5 OR :d > 17;');
    expect(valuedCtx.replacements).toEqual({
        '!table': params['!table'],
        'a': '$1',
        'd': '$2'
    });
    expect(valuedCtx.params).toEqual(['a', 'd']);
    expect(valuedCtx.args).toEqual([3, 13]);
});

test('should create valued context from unvalued context and named starred values', function() {
    const ctx = {
        tokens: [
            ['text', 'SELECT * FROM someTable'],
            ['text', ' WHERE '],
            ['param', 'a*'],
            ['text', ' IN (1,5) AND '],
            ['param', 'a**'],
            ['text', ' IN ((4,5), (6,7)) AND '],
            ['param', 'a*'],
            ['text', ' IN (1,4) AND '],
            ['param', 'a**'],
            ['text', ';']
        ]
    };
    const params = {
        'a*': [1,5],
        'a**': [[5,6],[7,8]]
    };

    const valuedCtx = pgTemplate.makeValuedContext(ctx, params);

    expect(valuedCtx.query).toEqual('SELECT * FROM someTable WHERE :a* IN (1,5) AND :a** IN ((4,5), (6,7)) AND :a* IN (1,4) AND :a**;');
    expect(valuedCtx.replacements).toEqual({
        'a*': '$1,$2',
        'a**': '($3,$4),($5,$6)'
    });
    expect(valuedCtx.params).toEqual(['a*', 'a**']);
    expect(valuedCtx.args).toEqual([1,5,5,6,7,8]);
});

test('should parse strings to tokens', function() {
    const testStrings = [
        'SELECT * FROM :!table WHERE :a > 5;',
        'SELECT * FROM :!table WHERE :a > 5\n\n',
        'SELECT * FROM peace WHERE :a* IN (1,5) AND :a** IN ((1,5));',
        'SELECT * FROM peace WHERE :*gen :a :b*;',
        'SELECT * FROM peace WHERE :*gen :a :b :c***\n\n',
        '--name: testquery\nSELECT * FROM :!table WHERE :a > 5;',
        '--name: testquery1\nSELECT * FROM t;\n\n--name:testquery2\nSELECT * FROM v;',
        '-- Some comment\nSELECT * FROM peace WHERE\n-- with a comment\n:*gen :a :b :c*\n\n',
        'SELECT * FROM evenMore WHERE id = :id;'
    ];

    const expected = [
        [
            ['text', 'SELECT * FROM '],
            ['param', '!table'],
            ['text', ' WHERE '],
            ['param', 'a'],
            ['text', ' > 5;']
        ],
        [
            ['text', 'SELECT * FROM '],
            ['param', '!table'],
            ['text', ' WHERE '],
            ['param', 'a'],
            ['text', ' > 5']
        ],
        [
            ['text', 'SELECT * FROM peace WHERE '],
            ['param', 'a*'],
            ['text', ' IN (1,5) AND '],
            ['param', 'a**'],
            ['text', ' IN ((1,5));']
        ],
        [
            ['text', 'SELECT * FROM peace WHERE '],
            ['generator', {name: '*gen', params: ['a', 'b']}],
            ['text', ';']
        ],
        [
            ['text', 'SELECT * FROM peace WHERE '],
            ['generator', {name: '*gen', params: ['a', 'b', 'c**']}]
        ],
        [
            ['name', 'testquery'],
            ['text', 'SELECT * FROM '],
            ['param', '!table'],
            ['text', ' WHERE '],
            ['param', 'a'],
            ['text', ' > 5;']
        ],
        [
            ['name', 'testquery1'],
            ['text', 'SELECT * FROM t;'],
            ['name', 'testquery2'],
            ['text', 'SELECT * FROM v;']
        ],
        [
            ['text', 'SELECT * FROM peace WHERE\n'],
            ['generator', {name: '*gen', params: ['a', 'b', 'c']}],
        ],
        [
            ['text', 'SELECT * FROM evenMore WHERE id = '],
            ['param', 'id'],
            ['text', ';']
        ]
    ];

    for (let strIdx in testStrings) {
        let parsed = pgTemplate.parseToTokens(testStrings[strIdx]);
        expect(parsed).toEqual(expected[strIdx]);
    }
});

test('should allow to override the parameter generator', function() {
    const ctx = {
        tokens: [
            ['text', 'SELECT * FROM someTable'],
            ['text', ' WHERE '],
            ['param', 'a*'],
            ['text', ' IN (1,5) AND '],
            ['param', 'a**'],
            ['text', ' IN ((4,5), (6,7));']
        ],
        makeParam: function() {
            return '?';
        }
    };
    const params = {
        'a*': [1,5],
        'a**': [[5,6],[7,8]]
    };

    const valuedCtx = pgTemplate.makeValuedContext(ctx, params);

    expect(valuedCtx.query).toEqual('SELECT * FROM someTable WHERE :a* IN (1,5) AND :a** IN ((4,5), (6,7));');
    expect(valuedCtx.replacements).toEqual({
        'a*': '?,?',
        'a**': '(?,?),(?,?)'
    });
    expect(valuedCtx.params).toEqual(['a*', 'a**']);
    expect(valuedCtx.args).toEqual([1,5,5,6,7,8]);
});

test('should allow repeating arguments', function() {
    const ctx = {
        tokens: [
            ['text', 'SELECT * FROM someTable'],
            ['text', ' WHERE '],
            ['param', 'a*'],
            ['text', ' IN (1,5) AND '],
            ['param', 'a**'],
            ['text', ' IN ((4,5), (6,7)) AND '],
            ['param', 'a**'],
            ['text', ' AND '],
            ['param', 'a*'],
            ['text', ' IN (1,4) AND '],
            ['param', 'a'],
            ['text', ' = 5 AND '],
            ['param', 'a'],
            ['text', ' > 4;']
        ],
        makeParam: function() {
            return '?';
        },
        repeatingArgs: true
    };
    const params = {
        'a*': [1,5],
        'a**': [[5,6],[7,8]],
        'a': '5'
    };

    const valuedCtx = pgTemplate.makeValuedContext(ctx, params);

    expect(valuedCtx.query).toEqual('SELECT * FROM someTable WHERE :a* IN (1,5) AND :a** IN ((4,5), (6,7)) AND :a** AND :a* IN (1,4) AND :a = 5 AND :a > 4;');
    expect(valuedCtx.replacements).toEqual({
        'a*': '?,?',
        'a**': '(?,?),(?,?)',
        'a': '?'
    });
    expect(valuedCtx.params).toEqual(['a*', 'a**', 'a**', 'a*', 'a', 'a']);
    expect(valuedCtx.args).toEqual([1,5,5,6,7,8,5,6,7,8,1,5,'5','5']);
});

test('should split a multi-query-file into multiple contexts', function() {
    const tokens = [
        ['text', 'SELECT * FROM abc;'],
        ['name', 'tquery1'],
        ['text', 'SELECT * FROM def;']
    ];

    const multiCtx = pgTemplate.makeNamedContexts(tokens);

    expect(multiCtx).toEqual({
        '': {
            tokens: [
                ['text', 'SELECT * FROM abc;']
            ]
        },
        'tquery1': {
            tokens: [
                ['text', 'SELECT * FROM def;']
            ]
        }
    });
});


test('should generate first-pass static context without values with repeating parameters', function() {
    const ctx = {
        tokens: [
            ['text', 'SELECT * FROM '],
            ['param', '!table'],
            ['text', ' WHERE '],
            ['param', 'a'],
            ['text', ' > 5 AND '],
            ['param', 'a'],
            ['text', ' < 600;']
        ]
    };

    const firstPassCtx = pgTemplate.makeValuedContext(ctx);

    const secondPassCtx = pgTemplate.makeValuedContext(firstPassCtx, {'a': 3, '!table': 'sometable'});

    expect(secondPassCtx.query).toEqual('SELECT * FROM :!table WHERE :a > 5 AND :a < 600;');
    expect(secondPassCtx.tokens).toEqual([['text', 'SELECT * FROM '],
                                          ['replacedParam', '!table'],
                                          ['text', ' WHERE '],
                                          ['replacedParam', 'a'],
                                          ['text', ' > 5 AND '],
                                          ['replacedParam', 'a'],
                                          ['text', ' < 600;']]);
    expect(secondPassCtx.replacements).toEqual({
        '!table': 'sometable',
        'a': '$1'
    });
    expect(secondPassCtx.params).toEqual(['a']);
    expect(secondPassCtx.args).toEqual([3]);
    expect(firstPassCtx.query).toEqual('SELECT * FROM :!table WHERE :a > 5 AND :a < 600;');
    expect(firstPassCtx.params).toEqual(['a']);
    expect(firstPassCtx.replacements).toEqual({'a': '$1'});
    expect(firstPassCtx.args).toEqual([]);
});


test('should generate first-pass static context without values', function() {
    const ctx = {
        tokens: [
            ['text', 'SELECT * FROM '],
            ['param', '!table'],
            ['text', ' WHERE '],
            ['param', 'a'],
            ['text', ' > 5 AND '],
            ['generator', {name: '*gen', params: ['a', 'b*']}],
            ['text', ';']
        ]
    };

    const _hook = function(c) {
        if (c > 5) {
            return {partial: ':c < 500 AND :c > 5 OR :d <= 17'};
        } else {
            return {partial: ':c < 5 OR :d > 17'};
        }
    };

    const firstPassCtx = pgTemplate.makeValuedContext(ctx);

    const secondPassCtx = pgTemplate.makeValuedContext(firstPassCtx, {'a': 3, 'b*': [5,6], '*gen': _hook, '!table': 'sometable'});

    expect(secondPassCtx.query).toEqual('SELECT * FROM :!table WHERE :a > 5 AND :a < 5 OR :b* > 17;');
    expect(secondPassCtx.replacements).toEqual({
        '!table': 'sometable',
        'a': '$1',
        'b*': '$2,$3'
    });
    expect(secondPassCtx.params).toEqual(['a', 'b*']);
    expect(secondPassCtx.args).toEqual([3,5,6]);
    expect(firstPassCtx.query).toEqual('SELECT * FROM :!table WHERE :a > 5 AND :*gen :a :b**;');
    expect(firstPassCtx.params).toEqual(['a']);
    expect(firstPassCtx.replacements).toEqual({'a': '$1'});
    expect(firstPassCtx.args).toEqual([]);
});

test('should replace static parameters first, then dynamic and count properly', function() {
    const baseTemplate = '-- name: test\nSELECT * FROM :!table\nWHERE a IN (:paramA*) AND b = :paramB;';

    const args = {
        '!table': 'someTable',
        'paramA*': [1,2,3],
        'paramB': 'buh!'
    };

    const contexts = pgTemplate.makeNamedContexts(pgTemplate.parseToTokens(baseTemplate));
    const testCtx = pgTemplate.makeValuedContext(contexts.test);
    const valuedTestCtx = pgTemplate.makeValuedContext(testCtx, args);
    expect(valuedTestCtx).toMatchObject({
        replacements: {
            '!table': args['!table'],
            'paramA*': '$2,$3,$4',
            'paramB': '$1'
        }
    });
});
