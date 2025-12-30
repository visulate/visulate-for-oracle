const util = require('util');
console.log('util.isDate before:', util.isDate);

util.isDate = function (d) {
  return d instanceof Date;
};

console.log('util.isDate after:', util.isDate);
console.log('Test date:', util.isDate(new Date()));
console.log('Test string:', util.isDate('hello'));
