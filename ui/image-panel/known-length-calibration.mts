// A one-line ruler supplies only an explicitly assumed isotropic scale. It
// cannot discover axis handedness, separate X/Y scales or image distortion.
type Row=Record<string,unknown>;
const row=(value:unknown):value is Row=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const objectId=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{32}$/.test(value);
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export interface KnownLengthReference {object_id:string;source_object_id:string;coordinates:readonly number[];panel:unknown;pixel_length:number;calibration:unknown;}
export function knownLengthReference(object:unknown,selection:unknown,frameIdentity:unknown):KnownLengthReference {
 if(!row(object)||!objectId(object.object_id)||object.array_domain==='frequency'||!row(selection)||selection.kind!=='line'||selection.coordinate_space!=='source_pixels'||!objectId(selection.source_object_id)||!row(frameIdentity)||frameIdentity.frame_object_id!==selection.source_object_id||!row(selection.panel)||selection.panel.domain!=='spatial_pixels'||selection.source_object_id!==selection.panel.source_object_id||!Array.isArray(object.panels)||object.panels.filter(panel=>same(panel,selection.panel)).length!==1||object.panels.filter(panel=>row(panel)&&panel.domain==='spatial_pixels'&&panel.source_object_id===selection.source_object_id).length!==1)throw new Error('先在来源已核对的空间图像上用“测量线”（L）沿已知标尺画线；频域、未知源帧或歧义映射不能用图内标尺定标。');
 const coordinates=selection.coordinates,rect=selection.panel.source_rect_xyxy;
 if(!Array.isArray(coordinates)||coordinates.length!==4||!coordinates.every(finite)||!Array.isArray(rect)||rect.length!==4||!rect.every(finite)||[0,2].some(i=>coordinates[i]<rect[0]||coordinates[i]>rect[2]||coordinates[i+1]<rect[1]||coordinates[i+1]>rect[3]))throw new Error('标尺端点必须位于已核对的源图像内。');
 const length=Math.hypot(coordinates[2]-coordinates[0],coordinates[3]-coordinates[1]);
 if(!Number.isFinite(length)||length<=0)throw new Error('标尺线必须有非零像素长度。');
 const calibration=object.xy_calibration;
 if(row(calibration)&&calibration.status==='active'){
  const xy=calibration.xy_scale;
  if(calibration.coordinate_domain!=='real_space'||!row(xy)||!finite(xy.x)||!finite(xy.y)||xy.x<=0||xy.y<=0||xy.x!==xy.y)throw new Error('当前已有带方向或非等比例 XY 标定；单条标尺不能替代它。请使用“补充／修订 XY 标定”明确设置两个轴。');
 }
 return {object_id:object.object_id,source_object_id:String(selection.source_object_id),coordinates:[...coordinates],panel:JSON.parse(JSON.stringify(selection.panel)),pixel_length:length,calibration:calibration??null};
}
export function knownLengthParameters(reference:KnownLengthReference,length:unknown,unit:unknown,isotropicConfirmed:boolean,note='',attemptId?:string){
 if(!finite(length)||length<=0)throw new Error('填写大于零的已知长度。');
 if(typeof unit!=='string'||!['nm','Å','um'].includes(unit))throw new Error('选择已知长度的单位。');
 if(!isotropicConfirmed)throw new Error('请明确确认相同 X/Y 像素尺寸假设；单条标尺无法检验图像拉伸。');
 const scale=length/reference.pixel_length;
 if(!Number.isFinite(scale)||scale<=0||!Number.isFinite(1/scale))throw new Error('该长度对应的像素尺寸超出有限数值范围。');
 if(typeof note!=='string'||note.length>800)throw new Error('标尺来源说明限 800 字。');
 if(attemptId!==undefined&&!/^[A-Za-z0-9_-]{1,64}$/.test(attemptId))throw new Error('无效的原标定尝试身份。');
 return {coordinate_domain:'real_space',scope:'image',xy_scale:{x:scale,y:scale,unit},source_text:JSON.stringify({method:'manual_image_ruler',authority:'researcher_declared',...(attemptId?{gui_attempt_id:attemptId}:{}),source_object_id:reference.source_object_id,source_view_object_id:reference.object_id,endpoints_source_pixels:reference.coordinates,pixel_length:reference.pixel_length,known_length:length,known_unit:unit,assumption:'equal positive X/Y pixel size; no axis orientation or distortion inferred',uncertainty:'unknown',note:note.trim()||'研究者指定的图内标尺长度'})};
}
// State readback supplies a candidate original request only for this exact
// frozen invocation. A legacy/other last operation is never an acknowledgement.
export function knownLengthAttemptRequest(operation:unknown,input:unknown,priorRequestId:unknown):string|null {
 if(!row(operation)||operation.state==='submitted'||typeof operation.request_id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(operation.request_id)||operation.request_id===priorRequestId||!same(operation.calibration_input,input)||!(operation.action==='calibrate'||['image_calibrate','image_preview'].includes(String(operation.tool))))return null;
 return operation.request_id;
}
