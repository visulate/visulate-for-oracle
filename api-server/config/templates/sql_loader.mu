LOAD DATA
INFILE './{{#results}}{{#TableDetails}}{{Name}}.csv{{/TableDetails}}{{/results}}'
INSERT INTO TABLE {{#results}}{{#TableDetails}}{{Name}}{{/TableDetails}}{{/results}}
FIELDS TERMINATED BY "," OPTIONALLY ENCLOSED BY '"' TRAILING NULCOLS
({{#results}}{{#Columns}}{{Name}}, {{/Columns}}{{/results}})