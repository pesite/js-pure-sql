%lex

%x nameprefix
%x comment

%%

"--"[-\s]*"name"\s*":"\s*     { this.begin('nameprefix'); return 'NAMEPREFIX'; }
"--"[-\s]*                    { this.begin('comment'); return 'COMMENTPREFIX'; }
<comment>.*\n*                { this.popState(); return 'REST'; }
<nameprefix>[^\s]+\n+         { this.popState(); return 'NAME'; }
.*((";"\n*)|(\n\n+))          { return 'ENDLINE'; }
[^;\n]*\n+                    { return 'LINE'; }
<<EOF>>                       { return 'EOF'; }

/lex

%start root

%%

root
  : queries { return $1; }
  ;

queries
    : query queries { let r = {}; if ($2 !== undefined) {r = $2; } r[$1.name.trim()] = $1.line.trim(); $$ = r; }
    | query { let rr = {}; rr[$1.name.trim()] = $1.line.trim(); $$ = rr; }
    ;

query
    : querylines queryend { $$ = {name: $1.name + $2.name, line: $1.line + $2.line}; }
    ;

queryend
    : EOF { $$ = { name: '', line: ''}; }
    | ENDLINE { $$ = {name: '', line: $1}; }
    ;

querylines
    : queryline querylines { $2 = $2 || {line: '', name: ''}; $$ = {line: $1.line + $2.line, name: $1.name + $2.name}; }
    | { $$ = { line: '', name: ''}; }
    ;

queryline
    : COMMENTPREFIX REST { $$ = {comment: $2, line: '', name: ''}; }
    | NAMEPREFIX NAME { $$ = {name: $2, line: ''}; }
    | LINE { $$ = {line: $1 || '', name: ''}; }
    ;
