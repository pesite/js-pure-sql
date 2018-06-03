%lex

%x nameprefix
%x comment
%x singlequotestring
%x doublequotestring
%x ingenerator

%%

"\s"  { return '\s'; }
':'':'+                         { return 'WORD'; }
<ingenerator>(\s*":"[a-zA-Z0-9-_]+"*"+)|(\s*":"[a-zA-Z0-9-_]+"*"+\s*\n\n\n*)        { this.popState(); return 'GENENDPARAM'; }
(":""!"?[a-zA-Z0-9-_]+"*"*)  { return 'ENDPARAM'; }
(\s*[^;\'\"`\s{:]+\s*";"\s*\n*)|(\s*[^;\'\"`\s{]+\s*\n\n\n*)  { return 'ENDWORD'; }
(\s*";"\s*\n*)|(\s*\n\n\n*)     { return 'ENDWORD'; }
\n*"--"[-\s]*"name"\s*":"\s*    { this.begin('nameprefix'); return 'NAMEPREFIX'; }
\n*"--"[-\s]*                   { this.begin('comment'); return 'COMMENTPREFIX'; }
<comment>.*\n*                  { this.popState(); return 'REST'; }
<nameprefix>[^\s]+\n+           { this.popState(); return 'NAME'; }

\s*"'"                          { this.begin('singlequotestring'); return 'WORD'; }
<singlequotestring>[^\']*"'"    { this.popState(); return 'WORD'; }
\s*'"'                          { this.begin('doublequotestring'); return 'WORD'; }
<doublequotestring>\s*[^\"]*'"' { this.popState(); return 'WORD'; }

<ingenerator>\s*":""!"?[a-zA-Z0-9-_]+"*"*    { return 'PARAM'; }
":""*"[a-zA-Z0-9-_]+         { this.begin('ingenerator'); return 'GENERATOR_NAME'; }
":""!"?[a-zA-Z0-9-_]+"*"*    { return 'PARAM'; }
\n*\s*[^;\'\"`\s:]+\s?|\s+      { return 'WORD'; }
<<EOF>>                         { return 'EOF'; }

/lex

%start root

%%

root
  : queries { return $1; }
  ;

queries
    : querylines queries {
        $$ = $1.concat($2); }
    | querylines {
        $$ = $1; }
    ;

querylines
    : queryline querylines {
        if ($1.type === 'text' && $2[0] && $2[0][0] === 'text') {
           $2[0][1] = $1.value + $2[0][1];
           $$ = $2;
        } else if ($1.type === 'text' && $1.value === '') {
           $$ = $2;
        } else if ($1.type === 'comment') {
           $$ = $2;
        } else {
           $$ = [[$1.type, $1.value]].concat($2);
        }
      }
    | queryend {
        if ($1.type !== 'text' || $1.value !== '') {
           $$ = [[$1.type, $1.value]];
        } else {
           $$ = []
        }
     }
    ;

generator_params
    : PARAM generator_params { $$ = {line: $2.line || '', name: '', params: [$1.trim().substring(1)].concat($2.params)}; }
    | GENENDPARAM { let trimmed2 = $1.trim().replace(';', '').replace(/\*$/, '').trim(); $$ = {line: $1.replace(/[^;]*/g, '') || ' ', params: [trimmed2.substring(1)]}; }
;

generator
    : GENERATOR_NAME generator_params { $$ = {type: 'generator', value: {name: $1.trim().substr(1), params: $2.params}}; }
;

queryline
    : COMMENTPREFIX REST { $$ = {type: 'comment'}; }
    | NAMEPREFIX NAME { $$ = {value: $2.trimRight(), type: 'name'}; }
    | generator { $$ = $1; }
    | WORD { $$ = {type: 'text', value: $1}; }
    | PARAM { $$ = {type: 'param', value: $1.trim().substring(1)}; }
    ;

queryend
    : EOF { $$ = { value: '', type: 'text'}; }
    | ENDWORD { $$ = {type: 'text', value: $1.trimRight()}; }
    | ENDPARAM { let trimmed = $1.replace(';', ' ').trim(); $$ = {type: 'param', value: trimmed.substring(1)}; }
    ;
