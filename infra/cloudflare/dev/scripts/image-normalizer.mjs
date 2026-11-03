// LOCAL service-binding adapter. Not imported into Worker bundles or exposed over HTTP.
// Remote DEV must supply an independently reviewed decoder; absence fails to quarantine.
import sharp from 'sharp';
export async function normalizeImage(request){
  try{
    const bytes=Buffer.from(await request.arrayBuffer());
    if(bytes.length>2097152)return new Response(null,{status:413});
    const image=sharp(bytes,{failOn:'warning',limitInputPixels:8000000,animated:false});
    const metadata=await image.metadata();
    if(!['jpeg','png','webp'].includes(metadata.format)||metadata.pages>1||!metadata.width||!metadata.height||metadata.width>4096||metadata.height>4096)throw new Error('unsupported_image');
    // Full decode, apply EXIF orientation, strip all metadata, encode a fresh PNG.
    const {data,info}=await image.rotate().png().toBuffer({resolveWithObject:true});
    if(data.length>2097152||info.width>4096||info.height>4096)throw new Error('normalized_image_too_large');
    return new Response(data,{headers:{'Content-Type':'image/png','X-Image-Width':String(info.width),'X-Image-Height':String(info.height),'X-Image-Normalized':'1'}});
  }catch{return new Response(null,{status:422});}
}
