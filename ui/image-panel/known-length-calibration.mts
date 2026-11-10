// A one-line ruler supplies only an explicitly assumed isotropic scale. It
// cannot discover axis handedness, separate X/Y scales or image distortion.
type Row=Record<string,unknown>;
const row=(value:unknown):value is Row=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const objectId=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{32}$/.test(value);
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export interface KnownLengthReference {object_id:string;source_object_id:string;coordinates:readonly number[];panel:unknown;pixel_length:number;calibration:unknown;coordinate_domain?:'reciprocal_space';declare_reciprocal?:boolean;}
export function knownLengthReference(object:unknown,selection:unknown,frameIdentity:unknown,requestedDomain?:'real_space'|'reciprocal_space'):KnownLengthReference {
 if(!row(object)||!objectId(object.object_id)||!row(selection)||selection.kind!=='line'||!['source_pixels','source_array_indices'].includes(String(selection.coordinate_space))||!objectId(selection.source_object_id)||!row(frameIdentity)||frameIdentity.frame_object_id!==selection.source_object_id||!row(selection.panel)||!['spatial_pixels','source_array_indices'].includes(String(selection.panel.domain))||selection.source_object_id!==selection.panel.source_object_id||!Array.isArray(object.panels)||object.panels.length!==1||!same(object.panels[0],selection.panel))throw new Error('先在来源已核对的标量图像上画两点测量线；FFT 频率坐标必须沿用原图实空间标定，不能用倒易标尺改写。');
 const calibration=object.xy_calibration,oldDomain=row(calibration)?calibration.coordinate_domain:null,domain=requestedDomain??(oldDomain==='reciprocal_space'||selection.panel.domain==='source_array_indices'?'reciprocal_space':'real_space');
 const reciprocal=domain==='reciprocal_space',unknown=[undefined,null,'unspecified_image'].includes(object.array_domain as undefined|null|string),declared=reciprocal&&unknown&&!calibration;
 if(reciprocal&&!(object.array_domain==='reciprocal'||object.array_domain==='frequency'||declared)||!reciprocal&&(object.array_domain==='reciprocal'||object.array_domain==='frequency')||oldDomain&&oldDomain!==domain)throw new Error('不能把已知实空间、倒易空间或现有标定互相改名；仅未知标量图可由研究者明确声明为衍射图。');
 const coordinates=selection.coordinates,rect=selection.panel.source_rect_xyxy;
 if(!Array.isArray(coordinates)||coordinates.length!==4||!coordinates.every(finite)||!Array.isArray(rect)||rect.length!==4||!rect.every(finite)||[0,2].some(i=>coordinates[i]<rect[0]||coordinates[i]>rect[2]||coordinates[i+1]<rect[1]||coordinates[i+1]>rect[3]))throw new Error('标尺端点必须位于已核对的源图像内。');
 const length=Math.hypot(coordinates[2]-coordinates[0],coordinates[3]-coordinates[1]);if(!Number.isFinite(length)||length<=0)throw new Error('标尺线必须有非零像素长度。');
 if(row(calibration)&&calibration.status==='active'){const xy=calibration.xy_scale;if(!row(xy)||!finite(xy.x)||!finite(xy.y)||xy.x<=0||xy.y<=0)throw new Error('当前已有带方向标定；单条正向标尺不能确定轴翻转，请使用分轴设置。');}
 return {object_id:object.object_id,source_object_id:String(selection.source_object_id),coordinates:[...coordinates],panel:JSON.parse(JSON.stringify(selection.panel)),pixel_length:length,calibration:calibration??null,...(reciprocal?{coordinate_domain:'reciprocal_space' as const,declare_reciprocal:declared}:{})};
}
export function knownLengthParameters(reference:KnownLengthReference,length:unknown,unit:unknown,isotropicConfirmed:boolean,note='',attemptId?:string,reciprocalConfirmed=false,replaceAnisotropicConfirmed=false){
 if(!finite(length)||length<=0)throw new Error('填写大于零的已知长度。');
 const reciprocal=reference.coordinate_domain==='reciprocal_space';if(typeof unit!=='string'||!(reciprocal?['1/nm','1/Å','1/um']:['nm','Å','um']).includes(unit))throw new Error('选择已知长度的单位。');
 if(reference.declare_reciprocal&&!reciprocalConfirmed)throw new Error('请明确声明这张未知标量图是电子衍射图；倒易标定不是材料或物相确认。');
 if(!isotropicConfirmed)throw new Error('请明确确认相同 X/Y 像素尺寸假设；单条标尺无法检验图像拉伸。');
 const old=reference.calibration;if(row(old)&&old.status==='active'&&row(old.xy_scale)&&old.xy_scale.x!==old.xy_scale.y&&!replaceAnisotropicConfirmed)throw new Error('当前 X/Y 不同；请明确确认用新的等方标尺替换，或取消并使用分轴设置。');
 const scale=length/reference.pixel_length;
 if(!Number.isFinite(scale)||scale<=0||!Number.isFinite(1/scale))throw new Error('该长度对应的像素尺寸超出有限数值范围。');
 if(typeof note!=='string'||note.length>800)throw new Error('标尺来源说明限 800 字。');
 if(attemptId!==undefined&&!/^[A-Za-z0-9_-]{1,64}$/.test(attemptId))throw new Error('无效的原标定尝试身份。');
 return {coordinate_domain:reciprocal?'reciprocal_space':'real_space',...(reference.declare_reciprocal?{declare_reciprocal:true}:{}),scope:'image',xy_scale:{x:scale,y:scale,unit},source_text:JSON.stringify({method:reciprocal?'manual_diffraction_ruler':'manual_image_ruler',authority:'researcher_declared',...(attemptId?{gui_attempt_id:attemptId}:{}),source_object_id:reference.source_object_id,source_view_object_id:reference.object_id,endpoints_source_pixels:reference.coordinates,pixel_length:reference.pixel_length,known_length:length,known_unit:unit,assumption:'equal positive X/Y pixel size; no axis orientation or distortion inferred',previous_calibration:row(reference.calibration)?{calibration_id:reference.calibration.calibration_id,revision:reference.calibration.revision,xy_scale:reference.calibration.xy_scale}:null,replacement_of_anisotropic_explicit:replaceAnisotropicConfirmed,uncertainty:'unknown',note:note.trim()||'研究者指定的图内标尺长度'})};
}
// State readback supplies a candidate original request only for this exact
// frozen invocation. A legacy/other last operation is never an acknowledgement.
export function knownLengthAttemptRequest(operation:unknown,input:unknown,priorRequestId:unknown):string|null {
 if(!row(operation)||operation.state==='submitted'||typeof operation.request_id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(operation.request_id)||operation.request_id===priorRequestId||!same(operation.calibration_input,input)||!(operation.action==='calibrate'||['image_calibrate','image_preview'].includes(String(operation.tool))))return null;
 return operation.request_id;
}

// Unit edits convert both numerical axes; viewing never rounds saved doubles.
export function convertCalibrationScale(value:number,from:string,to:string):number {
 const factors:Record<string,number>={nm:1,'Å':0.1,um:1000,'1/nm':1,'1/Å':10,'1/um':0.001};
 if(!(from in factors)||!(to in factors)||from.startsWith('1/')!==to.startsWith('1/'))throw new Error('不能用单位切换改变实空间／倒易空间标定域。');
 if(!Number.isFinite(value)||value===0)throw new Error('先填写有限、非零的每像素距离，再切换单位。');
 const converted=from===to?value:value*(factors[from]/factors[to]);if(!Number.isFinite(converted)||converted===0)throw new Error('换算结果超出有限数值范围。');return converted;
}
