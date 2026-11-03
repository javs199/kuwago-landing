// Separate raw-source distortion from correctness relative to a lossy encoding profile.
export function rasterMetrics(actual,reference){
  if(actual.info.width!==reference.info.width||actual.info.height!==reference.info.height||actual.info.channels!==reference.info.channels||actual.data.length!==reference.data.length)return null;
  let maximum=0,sum=0,squares=0,corners=0;const {width,height,channels}=actual.info;
  for(let i=0;i<actual.data.length;i++){const delta=Math.abs(actual.data[i]-reference.data[i]);maximum=Math.max(maximum,delta);sum+=delta;squares+=delta*delta;}
  for(const [x,y] of [[0,0],[width-1,0],[0,height-1],[width-1,height-1]])for(let c=0;c<3;c++){const at=(y*width+x)*channels+c;corners=Math.max(corners,Math.abs(actual.data[at]-reference.data[at]));}
  return {maxDelta:maximum,cornerMaxDelta:corners,mae:sum/actual.data.length,rmse:Math.sqrt(squares/actual.data.length),psnrDb:squares===0?null:10*Math.log10(255*255/(squares/actual.data.length)),identical:squares===0};
}
