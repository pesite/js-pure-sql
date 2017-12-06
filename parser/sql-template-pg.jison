%lex

%x nameprefix
%x comment
%x singlequotestring
%x doublequotestring

%%

"\s"  { return '\s'; }
':'':'+                         { return 'WORD'; }
(\s*":""!"?[a-zA-Z0-9-_]+"*"*\s*";"\s*\n*)|(\s*":""!"?[a-zA-Z0-9-_]+"*"*\s*\n\n\n*)      { return 'ENDPARAM'; }
(\s*[^;\'\"`\s{:]+\s*";"\s*\n*)|(\s*[^;\'\"`\s{]+\s*\n\n\n*)  { return 'ENDWORD'; }
(\s*";"\s*\n*)|(\s*\n\n\n*)     { return 'ENDWORD'; }
\n*"--"[-\s]*"name"\s*":"\s*    { this.begin('nameprefix'); return 'NAMEPREFIX'; }
\n*"--"[-\s]*                   { this.begin('comment'); return 'COMMENTPREFIX'; }
<comment>.*\n*                  { this.popState(); return 'REST'; }
<nameprefix>[^\s]+\n+           { this.popState(); return 'NAME'; }

\s*"'"                          { this.begin('singlequotestring'); return 'WORD'; }
<singlequotestring>[^\']+"'"    { this.popState(); return 'WORD'; }
\s*'"'                          { this.begin('doublequotestring'); return 'WORD'; }
<doublequotestring>\s*[^\"]+'"' { this.popState(); return 'WORD'; }

\s*":""!"?[a-zA-Z0-9-_]+"*"*    { return 'PARAM'; }
\s*[^;\'\"`\s:]+                { return 'WORD'; }
<<EOF>>                         { return 'EOF'; }

/lex

%start root

%%

root
  : queries { return $1; }
  ;

queries
    : querylines queries {
        let r = {};
        if ($2 !== undefined) {
            r = $2;
        }
        let querylineParams = Object.assign($1.params || {}, $2.params || {});
        let querylineDynamicParams = Object.assign($1.dynamicParams || {}, $2.dynamicParams || {});
        r[$1.name.trim()] = {query: $1.line.trim(), params: querylineParams, length: $1.line.trim().length, dynamicParams: querylineDynamicParams};
        $$ = r; }
    | querylines {
        let rr = {};
        rr[$1.name.trim()] = {query: $1.line.trim(), params: $1.params, length: $1.line.trim().length, dynamicParams: $1.dynamicParams};
        $$ = rr; }
    ;

querylines
    : queryline querylines {
        let params = $2.params || {};
        let dynamicParams = $2.dynamicParams || {};
        if ($1.param && typeof(params[$1.param]) === 'undefined') {
            if ($1.param[0] !== '!' && $1.param.substr(-1) !== '*') {
                params[$1.param] = Object.keys(params).length+1;
            } else {
                dynamicParams[$1.param] = Object.keys(dynamicParams).length+1;
            }
        }
        if ($2.param && typeof(params[$2.param]) === 'undefined') {
            if ($2.param[0] !== '!' && $2.param.substr(-1) !== '*') {
                params[$2.param] = Object.keys(params).length+1;
            } else {
                dynamicParams[$2.param] = Object.keys(dynamicParams).length+1;
            }
        }
        $2 = $2 || {line: '', name: '', dynamicParams: {}};
        $$ = {line: $1.line + $2.line,
              name: $1.name + $2.name,
              params: params,
              dynamicParams: dynamicParams }; }
    | queryend { $$ = $1; }
    ;

queryline
    : COMMENTPREFIX REST { $$ = {comment: $2, line: ' ', name: ''}; }
    | NAMEPREFIX NAME { $$ = {name: $2, line: ''}; }
    | WORD { $$ = {line: $1 || '', name: ''}; }
    | PARAM { $$ = {line: $1 || '', name: '', param: $1.trim().substring(1)}; }
    ;

queryend
    : EOF { $$ = { name: '', line: '', dynamicParams: {}}; }
    | ENDWORD { $$ = {name: '', line: $1, dynamicParams: {}}; }
    | ENDPARAM { let trimmed = $1.replace(';', ' ').trim(); $$ = {line: $1 || '', name: '', param: trimmed.substring(1), params: {}, dynamicParams: {}}; }
    ;
