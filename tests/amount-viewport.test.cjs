const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const scope={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('test4/amount-viewport.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,scope);
const {amountViewportFit}=scope.exports;
test('entire amount-to-profit region fits after correction from every initial scroll position',()=>{
  let count=0;
  for(const width of [280,320,360,390,412,430,480,600,768,864,1024,1440])
    for(const height of [240,280,320,360,400,480,600,800,1000])
      for(const offset of [0,40,120])
        for(const scroll of [0,100,300,600,1000,1800]){
          const region=Math.min(height-16,Math.max(180,Math.min(420,width*.72)));
          const top=1200-scroll,bottom=top+region;
          const f=amountViewportFit(top,bottom,offset,offset+height,scroll,Math.max(scroll,2500));
          assert.ok(f.fits);
          const delta=f.target-scroll;
          if(f.target>0) assert.ok(top-delta>=offset+8-.01);
          assert.ok(bottom-delta<=offset+height-8+.01);
          count++;
        }
  assert.equal(count,1944);
});
test('late native focus scroll is corrected on subsequent measurement',()=>{
  const first=amountViewportFit(180,460,0,380,400,1800);
  assert.equal(first.target,488);
  const afterNative=amountViewportFit(220,500,0,380,448,1800);
  assert.equal(afterNative.target,576);
});
test('reserve temporary scroll room near document bottom',()=>{
  const f=amountViewportFit(200,490,0,350,900,930);
  assert.equal(f.target,1048);
  assert.equal(f.extra,120);
});
test('physically short viewport shows start without claiming all controls fit',()=>{
  const f=amountViewportFit(250,600,20,200,400,1800);
  assert.equal(f.fits,false);
  assert.equal(f.target,622);
});
test('already visible region does not move',()=>{
  assert.equal(amountViewportFit(50,300,0,380,600,1000).target,600);
});
