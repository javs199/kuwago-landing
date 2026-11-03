import sharp from 'sharp';
import {deflateSync} from 'node:zlib';
const crcTable=Uint32Array.from({length:256},(_,value)=>{let n=value;for(let b=0;b<8;b++)n=(n>>>1)^((n&1)?0xedb88320:0);return n>>>0;});
function crc(bytes){let n=0xffffffff;for(const b of bytes)n=(n>>>8)^crcTable[(n^b)&255];return(n^0xffffffff)>>>0;}
function chunk(name,body){const result=Buffer.alloc(body.length+12);result.writeUInt32BE(body.length);result.write(name,4);body.copy(result,8);result.writeUInt32BE(crc(result.subarray(4,-4)),result.length-4);return result;}
export async function syntheticCorpus(){
  const raw=Buffer.alloc(24*16*3);for(let y=0;y<16;y++)for(let x=0;x<24;x++){const color=y<8?(x<12?[220,20,20]:[20,220,20]):(x<12?[20,20,220]:[220,220,20]);for(let c=0;c<3;c++)raw[(y*24+x)*3+c]=color[c];}
  const base=()=>sharp(raw,{raw:{width:24,height:16,channels:3}}),cases=[];
  const add=(id,mime,bytes,expectedStatus='ok',extra={})=>cases.push({id,mime,base64:bytes.toString('base64'),expectedStatus,output:'png',width:24,height:16,...extra});
  for(const format of ['jpeg','png','webp'])add('valid-'+format,'image/'+format,await base()[format]().toBuffer());
  for(let orientation=1;orientation<=8;orientation++)add('exif-'+orientation,'image/jpeg',await base().jpeg().withMetadata({orientation}).withExifMerge({IFD0:{Artist:'KUWAGO_SYNTHETIC_TEST',ImageDescription:'SYNTHETIC_PRIVATE_METADATA'}}).toBuffer(), 'ok',{width:orientation>=5?16:24,height:orientation>=5?24:16});
  const png=Buffer.from(cases.find(c=>c.id==='valid-png').base64,'base64');
  const xmp='XML:com.adobe.xmp\0\0\0\0\0<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:exif="http://ns.adobe.com/exif/1.0/" exif:GPSLatitude="0,0.0N" exif:GPSLongitude="0,0.0E"/></rdf:RDF></x:xmpmeta>';
  add('private-metadata','image/png',Buffer.concat([png.subarray(0,33),chunk('tEXt',Buffer.from('synthetic\0SYNTHETIC_PRIVATE_METADATA')),chunk('iTXt',Buffer.from(xmp)),png.subarray(33)]));
  add('wrong-mime','image/jpeg',png,'rejected');
  add('unsupported-svg','image/svg+xml',Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'),'rejected');
  for(const format of ['jpeg','png','webp']){const original=Buffer.from(cases.find(c=>c.id==='valid-'+format).base64,'base64');add('truncated-'+format,'image/'+format,original.subarray(0,-8),'rejected');}
  const corrupt=Buffer.from(png);corrupt[40]^=255;add('corrupt-crc','image/png',corrupt,'rejected');
  const header=Buffer.from(png.subarray(16,29));header.writeUInt32BE(65535,0);header.writeUInt32BE(65535,4);add('dimension-bomb','image/png',Buffer.concat([png.subarray(0,8),chunk('IHDR',header),png.subarray(33)]),'rejected');
  const small=Buffer.from(png.subarray(16,29));small.writeUInt32BE(1,0);small.writeUInt32BE(1,4);add('inflation-bomb','image/png',Buffer.concat([png.subarray(0,8),chunk('IHDR',small),chunk('IDAT',deflateSync(Buffer.alloc(4*1024*1024))),chunk('IEND',Buffer.alloc(0))]),'rejected');
  add('oversize','image/png',Buffer.alloc(2097153),'rejected');
  add('maximum-width','image/png',await sharp({create:{width:4096,height:1,channels:3,background:'#3B0C5B'}}).png().toBuffer(),'ok',{width:4096,height:1});
  for(const output of ['jpeg','webp'])add('output-'+output,'image/png',png,'ok',{output});
  return cases;
}
