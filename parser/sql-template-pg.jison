%lex

%x nameprefix
%x comment
%x singlequotestring
%x doublequotestring

%%

(\s*\{[^\s]+\}\s*";"\s*\n*)|(\s*\{[^\s]+\}\s*\n\n\n*)      { return 'ENDPARAM'; }
(\s*[^;\'\"`\s]+\s*";"\s*\n*)|(\s*[^;\'\"`\s]+\s*\n\n\n*)  { return 'ENDWORD'; }
(\s*";"\s*\n*)|(\s*\n\n\n*)     { return 'ENDWORD'; }
\n*"--"[-\s]*"name"\s*":"\s*    { this.begin('nameprefix'); return 'NAMEPREFIX'; }
\n*"--"[-\s]*                   { this.begin('comment'); return 'COMMENTPREFIX'; }
<comment>.*\n*                  { this.popState(); return 'REST'; }
<nameprefix>[^\s]+\n+           { this.popState(); return 'NAME'; }

\s*"'"                          { this.begin('singlequotestring'); return 'WORD'; }
<singlequotestring>[^\']+"'"    { this.popState(); return 'WORD'; }
\s*'"'                          { this.begin('doublequotestring'); return 'WORD'; }
<doublequotestring>\s*[^\"]+'"' { this.popState(); return 'WORD'; }

\s*\{[^\s]+\}                   { return 'PARAM'; }
\s*[^;\'\"`\s]+                 { return 'WORD'; }
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
        r[$1.name.trim()] = {query: $1.line.trim(), params: querylineParams, length: $1.line.trim().length};
        $$ = r; }
    | querylines {
        let rr = {};
        rr[$1.name.trim()] = {query: $1.line.trim(), params: $1.params, length: $1.line.trim().length};
        $$ = rr; }
    ;

querylines
    : queryline querylines {
        let params = $2.params;
        if ($1.param && typeof(params[$1.param]) === 'undefined') {
            params[$1.param] = Object.keys(params).length+1;
        }
        if ($2.param && typeof(params[$2.param]) === 'undefined') {
            params[$2.param] = Object.keys(params).length+1;
        }
        $2 = $2 || {line: '', name: ''};
        $$ = {line: $1.line + $2.line,
              name: $1.name + $2.name,
              params: params}; }
    | queryend { $$ = $1; }
    ;

queryline
    : COMMENTPREFIX REST { $$ = {comment: $2, line: ' ', name: ''}; }
    | NAMEPREFIX NAME { $$ = {name: $2, line: ''}; }
    | WORD { $$ = {line: $1 || '', name: ''}; }
    | PARAM { $$ = {line: $1 || '', name: '', param: $1.trim().substring(1, $1.trim().length-1)}; }
    ;

queryend
    : EOF { $$ = { name: '', line: ''}; }
    | ENDWORD { $$ = {name: '', line: $1}; }
    | ENDPARAM { let trimmed = $1.replace(';', ' ').trim(); $$ = {line: $1 || '', name: '', param: trimmed.substring(1, trimmed.length-1), params: {}}; }
    ;
