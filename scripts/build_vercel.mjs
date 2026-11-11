import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const projectRoot=new URL('../',import.meta.url),distRoot=new URL('../dist/',import.meta.url);
await mkdir(distRoot,{recursive:true});
for(const item of ['index.html','assets','vendor','EDA_企鹅数据探索/penguins.csv']){
  const destination=new URL(item,distRoot);
  if(item.endsWith('.csv'))await mkdir(new URL('EDA_企鹅数据探索/',distRoot),{recursive:true});
  await cp(new URL(item,projectRoot),destination,{recursive:true});
}
console.log('Static app prepared: '+fileURLToPath(distRoot));
