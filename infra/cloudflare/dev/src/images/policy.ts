import {ApiFailure} from '../catalog/errors.js';
import {imagePolicy} from '../media.js';
export const normalizationPolicy='kuwago-png-v2';
export type ImageHeader={mime:'image/jpeg'|'image/png'|'image/webp';width:number;height:number;orientation:number};
export function dimensions(width:number,height:number){
  if(![width,height].every(n=>Number.isSafeInteger(n)&&n>0&&n<=imagePolicy.maxDimension)||width*height>imagePolicy.maxPixels)throw new ApiFailure(422,'invalid_image_dimensions');
}
const bad=():never=>{throw new ApiFailure(422,'corrupt_or_unsupported_image');};
const ascii=(v:Uint8Array,start:number,length:number)=>String.fromCharCode(...v.subarray(start,start+length));
export function imageMime(bytes:ArrayBuffer):ImageHeader['mime']|null{
  const v=new Uint8Array(bytes);
  if(v.length>=24&&[137,80,78,71,13,10,26,10].every((x,i)=>v[i]===x))return 'image/png';
  if(v.length>3&&v[0]===255&&v[1]===216&&v[2]===255)return 'image/jpeg';
  if(v.length>16&&ascii(v,0,4)==='RIFF'&&ascii(v,8,4)==='WEBP')return 'image/webp';
  return null;
}
function orientation(bytes:Uint8Array):number{
  if(ascii(bytes,0,6)==='Exif\0\0')bytes=bytes.subarray(6);
  if(bytes.length<8)return bad();const order=ascii(bytes,0,2),little=order==='II';if(order!=='II'&&order!=='MM')return bad();
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);if(view.getUint16(2,little)!==42)return bad();
  const offset=view.getUint32(4,little);if(offset<8||offset+2>bytes.length)return bad();const count=view.getUint16(offset,little);if(count>256||offset+2+count*12+4>bytes.length)return bad();
  let result=1,found=false;
  for(let i=0;i<count;i++){const at=offset+2+i*12;if(view.getUint16(at,little)!==0x112)continue;if(found||view.getUint16(at+2,little)!==3||view.getUint32(at+4,little)!==1)return bad();result=view.getUint16(at+8,little);if(result<1||result>8)return bad();found=true;}
  return result;
}
const crcTable=Uint32Array.from({length:256},(_,value)=>{let n=value;for(let bit=0;bit<8;bit++)n=(n>>>1)^((n&1)?0xedb88320:0);return n>>>0;});
export function crc32(bytes:Uint8Array):number{let crc=0xffffffff;for(const b of bytes)crc=(crc>>>8)^crcTable[(crc^b)&255]!;return (crc^0xffffffff)>>>0;}
type Png={header:ImageHeader;depth:number;color:number;interlace:number;paletteEntries:number;chunks:{name:string;bytes:Uint8Array<ArrayBuffer>}[]};
function png(bytes:ArrayBuffer):Png{
  const v=new Uint8Array(bytes),view=new DataView(bytes);let offset=8,header:ImageHeader|undefined,ended=false,data=false,dataEnded=false,exif=false;
  const chunks:Png['chunks']=[];const seen=new Set<string>();let depth=0,color=0,interlace=0,paletteEntries=0,compressedSize=0;
  while(offset<bytes.byteLength){
    if(chunks.length>=1024||offset+12>v.length)return bad();const size=view.getUint32(offset),end=offset+12+size;
    if(end>v.length)return bad();const name=ascii(v,offset+4,4);if(!/^[A-Za-z]{4}$/.test(name)||name[2]!==name[2]!.toUpperCase()||crc32(v.subarray(offset+4,end-4))!==view.getUint32(end-4))return bad();
    if(!header&&name!=='IHDR'||ended||['acTL','fcTL','fdAT'].includes(name))return bad();
    if(!['IHDR','PLTE','IDAT','IEND'].includes(name)&&name[0]===name[0]!.toUpperCase())return bad();
    if(name==='IHDR'){
      if(header||size!==13)return bad();const width=view.getUint32(offset+8),height=view.getUint32(offset+12);dimensions(width,height);
      depth=v[offset+16]!;color=v[offset+17]!;interlace=v[offset+20]!;const depths:Record<number,number[]>={0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]};
      if(!depths[color]?.includes(depth)||v[offset+18]!==0||v[offset+19]!==0||!([0,1] as unknown[]).includes(v[offset+20]))return bad();
      header={mime:'image/png',width,height,orientation:1};
    }
    if(name==='PLTE'||name==='tRNS'){
      if(data||seen.has(name))return bad();
      if(name==='PLTE'){if([0,4].includes(color)||seen.has('tRNS')||size<3||size>768||size%3!==0||color===3&&size/3>2**depth)return bad();paletteEntries=size/3;}
      else if([4,6].includes(color)||color===3&&(!paletteEntries||size<1||size>paletteEntries)||color===0&&(size!==2||view.getUint16(offset+8)>2**depth-1)||color===2&&(size!==6||[8,10,12].some(at=>view.getUint16(offset+at)>2**depth-1)))return bad();
    }
    if(name==='IDAT'){if(dataEnded||color===3&&!paletteEntries)return bad();compressedSize+=size;data=true;}else if(data)dataEnded=true;
    if(name==='eXIf'){if(exif)return bad();header!.orientation=orientation(v.subarray(offset+8,end-4));exif=true;}
    if(name==='IEND'){if(!data||size!==0||end!==v.length)return bad();ended=true;}
    chunks.push({name,bytes:v.subarray(offset,end)});seen.add(name);offset=end;
  }
  if(!header||!ended||compressedSize<6)return bad();return {header,depth,color,interlace,paletteEntries,chunks};
}
// Validate one complete zlib stream incrementally. Never allocate the inflated raster.
// Row sizes include the filter byte; Adam7 empty passes contain no rows at all.
export async function validatePngData(bytes:ArrayBuffer):Promise<void>{
  const image=png(bytes),channels=({0:1,2:3,3:1,4:2,6:4} as Record<number,number>)[image.color]!;
  const passes=image.interlace===0?[[0,0,1,1]]:[[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]];
  const rows=passes.map(([x=0,y=0,dx=1,dy=1])=>{
    const width=Math.max(0,Math.ceil((image.header.width-x)/dx)),height=Math.max(0,Math.ceil((image.header.height-y)/dy));
    return {width,height:width?height:0,bytes:Math.ceil(width*channels*image.depth/8)};
  }).filter(pass=>pass.height>0);
  const expected=rows.reduce((n,pass)=>n+(pass.bytes+1)*pass.height,0);
  if(!Number.isSafeInteger(expected)||expected<1||expected>64*1024*1024+16384)return bad();
  const idat=image.chunks.filter(chunk=>chunk.name==='IDAT');let index=0;
  const source=new ReadableStream<BufferSource>({pull(controller){if(index===idat.length){controller.close();return;}const chunk=idat[index++]!.bytes;controller.enqueue(chunk.subarray(8,chunk.length-4));}});
  const reader=source.pipeThrough(new DecompressionStream('deflate')).getReader();
  let total=0,pass=0,remainingRows=rows[0]!.height,remainingBytes=0,expired=false,filter=0;
  let previousRow=new Uint8Array(image.color===3?rows[0]!.bytes:0),currentRow=new Uint8Array(previousRow.length);
  const timer=setTimeout(()=>{expired=true;void reader.cancel().catch(()=>undefined);},30000);
  try{
    while(true){
      const next=await reader.read();if(next.done)break;
      if(total+next.value.length>expected)throw new ApiFailure(422,'png_raster_length_mismatch');
      total+=next.value.length;let offset=0;
      while(offset<next.value.length){
        if(remainingBytes===0){if(pass>=rows.length)throw new ApiFailure(422,'png_raster_length_mismatch');filter=next.value[offset++]!;if(filter>4)throw new ApiFailure(422,'png_invalid_filter');remainingBytes=rows[pass]!.bytes;}
        const count=Math.min(remainingBytes,next.value.length-offset),rowOffset=rows[pass]!.bytes-remainingBytes;
        if(image.color===3)for(let i=0;i<count;i++){
          const at=rowOffset+i,left=at?currentRow[at-1]!:0,up=previousRow[at]!,upperLeft=at?previousRow[at-1]!:0;
          const p=left+up-upperLeft,pa=Math.abs(p-left),pb=Math.abs(p-up),pc=Math.abs(p-upperLeft);
          const prediction=filter===0?0:filter===1?left:filter===2?up:filter===3?Math.floor((left+up)/2):pa<=pb&&pa<=pc?left:pb<=pc?up:upperLeft;
          currentRow[at]=(next.value[offset+i]!+prediction)&255;
        }
        remainingBytes-=count;offset+=count;
        if(remainingBytes===0){
          if(image.color===3){
            for(let x=0;x<rows[pass]!.width;x++){const bit=x*image.depth,index=(currentRow[bit>>>3]!>>>(8-image.depth-(bit&7)))&((1<<image.depth)-1);if(index>=image.paletteEntries)throw new ApiFailure(422,'png_invalid_palette_index');}
            const swap=previousRow;previousRow=currentRow;currentRow=swap;
          }
          if(--remainingRows===0){pass++;remainingRows=rows[pass]?.height??0;if(image.color===3&&pass<rows.length){previousRow=new Uint8Array(rows[pass]!.bytes);currentRow=new Uint8Array(previousRow.length);}}
        }
      }
    }
    if(expired)throw new ApiFailure(503,'decoder_timeout');
    if(total!==expected||remainingBytes!==0||pass!==rows.length)throw new ApiFailure(422,'png_raster_length_mismatch');
  }catch(error){if(error instanceof ApiFailure)throw error;throw new ApiFailure(422,'png_invalid_zlib');}
  finally{clearTimeout(timer);await reader.cancel().catch(()=>undefined);reader.releaseLock();}
}
export function inspectImage(bytes:ArrayBuffer,declared:string):ImageHeader{
  if(bytes.byteLength<1||bytes.byteLength>imagePolicy.maxBytes)throw new ApiFailure(413,'file_too_large');
  const mime=imageMime(bytes);if(!mime||mime!==declared)throw new ApiFailure(422,'mime_content_mismatch');
  if(mime==='image/png')return png(bytes).header;
  const v=new Uint8Array(bytes),view=new DataView(bytes);let width=0,height=0,rotation=1,exif=false;
  if(mime==='image/jpeg'){
    if(v[v.length-2]!==255||v[v.length-1]!==217)return bad();let at=2,scan=false,inScan=false,ended=false,segments=0;
    while(at<v.length){
      if(inScan){while(at<v.length&&v[at]!==255)at++;}if(v[at++]!==255)return bad();while(v[at]===255)at++;const marker=v[at++];
      if(marker===undefined)return bad();if(inScan&&(marker===0||marker>=208&&marker<=215))continue;
      if(marker===217){if(!scan||at!==v.length)return bad();ended=true;break;}
      if(marker===0||marker===216||marker>=208&&marker<=215||++segments>1024)return bad();inScan=false;
      if(at+2>v.length)return bad();const size=view.getUint16(at);if(size<2||at+size>v.length)return bad();
      if(marker===225&&ascii(v,at+2,6)==='Exif\0\0'){if(exif)return bad();rotation=orientation(v.subarray(at+2,at+size));exif=true;}
      if(marker===226&&ascii(v,at+2,4)==='MPF\0')return bad();
      if([192,193,194].includes(marker)){if(width||size<8)return bad();height=view.getUint16(at+3);width=view.getUint16(at+5);dimensions(width,height);}
      else if(marker>=195&&marker<=207&&![196,200,204].includes(marker))return bad();
      if(marker===218){scan=true;inScan=true;}at+=size;
    }
    if(!width||!scan||!ended)return bad();
  }else{
    if(view.getUint32(4,true)+8!==v.length)return bad();let at=12,codec=false,extended=false;
    while(at<v.length){
      if(at+8>v.length)return bad();const name=ascii(v,at,4),size=view.getUint32(at+4,true),start=at+8,end=start+size;
      if(end+(size%2)>v.length)return bad();if(['ANIM','ANMF'].includes(name))return bad();
      if(name==='VP8X'){if(extended||size!==10||(v[start]!&2))return bad();extended=true;width=1+v[start+4]!+(v[start+5]!<<8)+(v[start+6]!<<16);height=1+v[start+7]!+(v[start+8]!<<8)+(v[start+9]!<<16);dimensions(width,height);}
      if(name==='VP8 '||name==='VP8L'){
        if(codec)return bad();codec=true;let w,h;
        if(name==='VP8 '){if(size<10||v[start]!&1||ascii(v,start+3,3)!=='\x9d\x01\x2a')return bad();w=view.getUint16(start+6,true)&0x3fff;h=view.getUint16(start+8,true)&0x3fff;}
        else{if(size<5||v[start]!==47||(v[start+4]!>>5)!==0)return bad();const bits=view.getUint32(start+1,true);w=1+(bits&0x3fff);h=1+((bits>>>14)&0x3fff);}
        dimensions(w,h);if(extended&&(w!==width||h!==height))return bad();width=w;height=h;
      }
      if(name==='EXIF'){if(exif)return bad();rotation=orientation(v.subarray(start,end));exif=true;}
      at=end+(size%2);
    }
    if(!codec)return bad();
  }
  dimensions(width,height);return {mime,width,height,orientation:rotation};
}
// Structural check, not an image decoder: a trusted full decode/re-encode must precede this.
export function sanitizePng(bytes:ArrayBuffer,source:ImageHeader){
  if(bytes.byteLength>imagePolicy.maxBytes)throw new ApiFailure(413,'file_too_large');
  if(imageMime(bytes)!=='image/png')throw new ApiFailure(503,'decoder_invalid_response');
  const parsed=png(bytes),expected=source.orientation>=5?[source.height,source.width]:[source.width,source.height];
  if(parsed.header.width!==expected[0]||parsed.header.height!==expected[1])throw new ApiFailure(503,'decoder_orientation_mismatch');
  const keep=parsed.chunks.filter(chunk=>['IHDR','PLTE','tRNS','IDAT','IEND'].includes(chunk.name));
  const out=new Uint8Array(8+keep.reduce((n,c)=>n+c.bytes.length,0));out.set(new Uint8Array(bytes,0,8));let at=8;for(const c of keep){out.set(c.bytes,at);at+=c.bytes.length;}
  return {output:out.buffer,width:parsed.header.width,height:parsed.header.height};
}
export async function readImage(stream:ReadableStream<Uint8Array>|null):Promise<ArrayBuffer>{
  if(!stream)throw new ApiFailure(503,'decoder_invalid_response');const reader=stream.getReader(),bytes=new Uint8Array(imagePolicy.maxBytes);let count=0;
  try{while(true){const item=await reader.read();if(item.done)break;if(count+item.value.length>imagePolicy.maxBytes)throw new ApiFailure(413,'file_too_large');bytes.set(item.value,count);count+=item.value.length;}return bytes.slice(0,count).buffer;}finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}
}
