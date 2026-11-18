const assert = require('node:assert/strict');
const M=require('./matcher.js');
assert.equal(M.courseCode('cop3502c'),'COP 3502C');
assert.deepEqual(M.expectedCodes('Research-Intensive; Service Learning'),['RI','SL']);
assert.equal(M.expectedCodes('SL or IE'),null);
const p=[{term:'1890',course_code:'COP 3502C',class_number:'12345',instructor:'Ada Lovelace',hip_designations:['RI'],hip_observation:'observed'},
 {term:'1890',course_code:'COP 3502C',class_number:'12346',instructor:'Grace Hopper',hip_designations:[],hip_observation:'no_recognized_hip_in_visible_attributes'},
 {term:'1890',course_code:'ENC 1101',class_number:'12347',instructor:'Sam Lee',hip_designations:[],hip_observation:'unknown_attributes_not_found'}];
const rows=[{number:2,values:['COP','3502C','RI','Course Level','','']},
 {number:3,values:['COP','3502C','RI','Instructor Level','Ada','Lovelace']},
 {number:4,values:['COP','3502C','RI','Instructor Level','Grace','Hopper']},
 {number:5,values:['ENC','1101','SL','Course Level','','']},
 {number:6,values:['ZOO','5001','IE','Course Level','','']},
 {number:7,values:['COP','3502C','SL or IE','Course Level','','']}];
const mapping={course:0,number:1,hip:2,level:3,instructor:4,last:5,classNumber:null};
const runs=[{term:'1890',subject:'COP',course:'3502C',status:'completed_visible_results'},
 {term:'1890',subject:'ENC',course:'1101',status:'completed_visible_results'}];
const result=M.compare({dataRows:rows,mapping,publicRows:p,runs,term:'1890'});
assert.deepEqual(result.map(r=>r.outcome), ['Review difference','Match','Review difference','Unknown','Not checked','Unknown']);
const partial=M.compare({dataRows:[rows[1]],mapping,publicRows:p,runs:[],term:'1890'});
assert.equal(partial[0].outcome,'Provisional match');
const subjectRuns=[{term:'1890',subject:'COP',course:null,status:'completed_visible_results',details_requested:true}];
const subjectMatch=M.compare({dataRows:[rows[1]],mapping,publicRows:p,runs:subjectRuns,term:'1890'});
assert.equal(subjectMatch[0].outcome,'Match');
const lots=Array.from({length:10000},(_,i)=>({number:i+2,values:['COP','3502C','RI','Instructor Level','Ada','Lovelace']}));
const start=performance.now();
const many=M.compare({dataRows:lots,mapping,publicRows:p,runs,term:'1890'});
assert.equal(many.length,10000);
console.log('PASS: 6 focused matching cases; 10,000-row comparison in',Math.round(performance.now()-start),'ms');
