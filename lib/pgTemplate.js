'use strict';

const sqlPgParser = require('../parser/sql-template-pg.js').parser;

/**
 * Goal for this library is, given a list of parsed tokens (pairs of name, token-value),
 * to return a map of named contexts:
 * {
 *   "ctx1": ctx1,
 *   "ctx2": ctx2, ...
 * }
 * Those names will correspond to query names. The default name is ''.
 * For each context, you can then generate a query-args-pair as before,
 * where <query> is the prepared statement query and
 * <args> is the array of values that correspond to the respective prepared argument.
 * Lastly, given some initial parameters, the generation of prepared argument placeholders
 * can be configured. That is, the usual Postgresql placeholder is $x, where x is the idx+1
 * if the value in <args>. For MySQL that placeholder would be ? and repeating occurrences
 * of parameters need to be duplicated at the right indices.
 * All of this will be taken care of in this library.
 * TODO: How to achieve?
 **/

// TODO: description
function _makeNamedContexts(tokens, paramFunc, repeatingArgs) {
    let ctxs = {};
    let curCtx = {name: '', tokens: []};
    let addCtx = function(ctx) {
        if (curCtx.tokens.length > 0) {
            // TODO: make a nicer copy, so I don't need to state makeParam again
            ctxs[ctx.name] = {tokens: ctx.tokens, makeParam: paramFunc, repeatingArgs: repeatingArgs};
            curCtx.tokens = [];
            curCtx.name = '';
        }
    };

    for (let tok of tokens) {
        if (tok[0] === 'name') {
            addCtx(curCtx);
            curCtx.name = tok[1];
        } else {
            curCtx.tokens.push(tok);
        }
    }
    addCtx(curCtx);

    return ctxs;
}

// TODO: better name and description
// do all replacements on the full query
// return query-params-pair.
// takes stuff from ctx: TODO: explain
// TODO: do not do string replacement, but only merging of array elements
function _doReplacements(ctx) {
    let replacedQuery = [];

    for (let tok of ctx.tokens) {
        switch (tok[0]) {
        case 'text':
            replacedQuery.push(tok[1]);
            break;
        case 'replacedParam':
            replacedQuery.push(ctx.replacements[tok[1]]);
            break;
        case 'replacedGenerator':
            let replaced = _doReplacements({tokens: tok[1], replacements: ctx.replacements});
            replacedQuery.push(replaced.query);
            break;
        case 'param':
            replacedQuery.push(':' + tok[1]);
            break;
        case 'generator':
            replacedQuery.push(':'+tok[1].name + ' ' + tok[1].params.map(function(p) { return ':'+p; }).join(' ') + '*');
            break;
        default:
            console.error(tok);
            throw new Error('TODO: incomplete replacement token ' + tok[0]);
        }
    }

    return {
        query: replacedQuery.join(''),
        args: ctx.args
    };
}

// TODO: description
function _parseToTokens(str) {
    return sqlPgParser.parse(str);
}

// TODO: generate args, query, and replacements

// TODO: a lot to describe
function _makeNewParam(paramNum, name) {
    let idx = paramNum + 1;
    return '$' + idx;
}

// TODO: descibe this local function
function _pushArgs(ctx, param, paramObj) {
    if (!ctx.replacements[param]) {
        throw new Error('TODO: missing parameter replacement');
    }
    if (!paramObj || !paramObj[param]) {
        throw new Error('TODO: missing parameter value');
    }

    let val = paramObj[param];

    if (Array.isArray(val)) {
        // TODO: stricter
        for (let v of val) {
            if (Array.isArray(v)) {
                for (let vv of v) {
                    ctx.args.push(vv);
                }
            } else {
                ctx.args.push(v);
            }
        }
    } else {
        ctx.args.push(val);
    }

    return ctx;
}

// TODO: explain
// from an unvalued context and a parameter mapping, generate a valued context
// with replacements and args
// TODO: If repeatingArgs, create args in parse order. If not repeatingArgs, create them in parameter order
//       For named args, the user needs to ignore args totally and create a paramFunc that creates named args
//       that means, there are numbered, unnumbered, and named parameters for a query. And maybe they could be even mixed.
function _makeValuedContext(ctx, paramObj) {
    // TODO: assert ctx.tokens exists and is array or so
    let query = '';
    let localCtx = {
        replacements: Object.assign({}, ctx.replacements || {}),
        params: [].concat(ctx.params || []),
        args: [].concat(ctx.args || []),
        tokens: [].concat(ctx.tokens || []),
        inArgs: Object.assign({}, ctx.inArgs || {}),
        paramCount: ctx.paramCount || 0,
        makeParam: ctx.makeParam,
        repeatingArgs: ctx.repeatingArgs
    };
    let makeParamFunc = localCtx.makeParam || _makeNewParam;

    // Generate all replacements, that haven't been generated, yet.
    for (let tokenIdx in localCtx.tokens) {
        let token = localCtx.tokens[tokenIdx];
        switch(token[0]) {
        case 'text':
            query += token[1];
            break;
        case 'param':
            query += ':' + token[1];

            // TODO: assert paramObj contains token[1]
            if (token[1][0] === '!') {
                if (paramObj) {
                    localCtx.replacements[token[1]] = paramObj[token[1]];
                    localCtx.tokens[tokenIdx] = ['replacedParam', token[1]];
                }
            } else if (token[1].substr(-2) === '**') {
                if (!paramObj) {
                    continue;
                }

                // TODO: repeatingArgs support
                if (localCtx.replacements[token[1]]) {
                    if (ctx.repeatingArgs) {
                        localCtx.params.push(token[1]);
                    }
                    localCtx.tokens[tokenIdx] = ['replacedParam', token[1]];
                    continue;
                }

                // TODO: assert existence of parameter in paramObj
                let newParamList = [];

                for (let plistI in paramObj[token[1]]) {
                    let newParams = [];
                    for (let i in paramObj[token[1]][plistI]) {
                        newParams.push(makeParamFunc(localCtx.paramCount, token[1]));
                        localCtx.paramCount++;
                    }
                    newParamList.push('(' + newParams.join(',') + ')');
                }

                localCtx.replacements[token[1]] = newParamList.join(',');
                localCtx.params.push(token[1]);
                localCtx.tokens[tokenIdx] = ['replacedParam', token[1]];
            } else if (token[1].substr(-1) === '*') {
                if (!paramObj) {
                    continue;
                }

                // TODO: repeatingArgs support
                if (localCtx.replacements[token[1]]) {
                    if (ctx.repeatingArgs) {
                        localCtx.params.push(token[1]);
                    }
                    localCtx.tokens[tokenIdx] = ['replacedParam', token[1]];
                    continue;
                }

                // TODO: assert existence of parameter in paramObj
                let newParams = [];

                // TODO: find proper starting index for dynamic replacement (which should be count of static args + 1)
                for (let i in paramObj[token[1]]) {
                    newParams.push(makeParamFunc(localCtx.paramCount, token[1]));
                    localCtx.paramCount++;
                }

                localCtx.replacements[token[1]] = newParams.join(',');
                localCtx.params.push(token[1]);
                localCtx.tokens[tokenIdx] = ['replacedParam', token[1]];
            } else {
                if (localCtx.replacements[token[1]]) {
                    if (localCtx.repeatingArgs) {
                        localCtx.params.push(token[1]);
                    }
                    localCtx.tokens[tokenIdx] = ['replacedParam', token[1]];
                } else {
                    localCtx.replacements[token[1]] = makeParamFunc(localCtx.paramCount, token[1]);
                    localCtx.paramCount++;
                    localCtx.params.push(token[1]);
                    localCtx.tokens[tokenIdx] = ['replacedParam', token[1]];
                }
            }
            break;
        case 'generator':
            if (!paramObj) {
                query += ':'+token[1].name + ' ' + token[1].params.map(function(p) { return ':'+p; }).join(' ') + '*';
                continue;
            }
            // TODO: do not run generator recursively, but put a function into replacements and run it
            // TODO: detect cyclic calling of generators
            // TODO: allow constants in generator.params (like {params: [['param', 'a'], ['constant', ':*gen1']]}
            // TODO
            // parse output partial into tokens
            // remove query names
            // replace all generator arguments by order (that is map first found param to first argument and so on)
            // (or use the mapping returned by generator.params)
            // and append query and maybe new replacements, args, or params
            // update localCtx with the ctx from query.tokens
            // TODO: assert genHook contained in paramObj
            // TODO: assert that generatorMeta.params exist
            let generatorMeta = token[1];
            let genHook = paramObj[generatorMeta.name];
            let hookArgs = generatorMeta.params.map(function(p) { return paramObj[p]; });

            let partial = genHook.apply(null, hookArgs);

            let parsedPartial = _parseToTokens(partial.partial).filter(function(t) { return t[0] !=='name'; });

            // TODO: add additional feature for using the mapping provided by hook (partial.params)
            // Replace paramNames
            let genContextReplacements = {};
            let curParamIdx = 0;
            for (let tok of parsedPartial) {
                if (tok[0] === 'param') {
                    if (curParamIdx >= generatorMeta.params.length) {
                        console.log('TODO: What should I do with too few arguments?');
                    }

                    if (!genContextReplacements[tok[1]]) {
                        genContextReplacements[tok[1]] = generatorMeta.params[curParamIdx];
                        curParamIdx++;
                    }

                    if (genContextReplacements[tok[1]]) {
                        tok[1] = genContextReplacements[tok[1]];
                    }
                }
            }

            let partialCtx = _makeValuedContext(Object.assign({}, localCtx, {tokens: parsedPartial}), paramObj);
            localCtx.params = partialCtx.params;
            localCtx.args = partialCtx.args;
            localCtx.replacements = partialCtx.replacements;
            query += partialCtx.query;

            localCtx.tokens[tokenIdx] = ['replacedGenerator', partialCtx.tokens];
            break;
        case 'replacedParam':
            query += ':' + token[1];
            if (localCtx.repeatingArgs || !localCtx.inArgs[token[1]]) {
                localCtx.args.push(paramObj[token[1]]);
                localCtx.inArgs[token[1]] = true;
            }
            continue;
        default:
            throw new Error('TODO ERROR unexpected token ' + token[0]);
        }
    }

    if (paramObj) {
        localCtx.args = [];
        for (let p of localCtx.params) {
            _pushArgs(localCtx, p, paramObj);
        }
    }

    localCtx.query = query;
    return localCtx;
}


module.exports = {
    doReplacements: _doReplacements,
    makeValuedContext: _makeValuedContext,
    parseToTokens: _parseToTokens,
    makeNamedContexts: _makeNamedContexts
};
