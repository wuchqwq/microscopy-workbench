// Module-local descriptions of browser operations used by the Panel. They add
// no globals to the server or to the ES2022-only shared compilation.
import type {PresentationElement,PresentationDocument,PresentationEvent} from './presentation-contracts.mjs';
export interface BrowserEvent extends PresentationEvent {
 readonly clientX:number;readonly clientY:number;readonly pointerId:number;readonly button:number;
 readonly shiftKey:boolean;readonly ctrlKey:boolean;readonly metaKey:boolean;readonly altKey:boolean;
 readonly deltaY:number;readonly code:string;readonly target:BrowserElement;returnValue:unknown;
}
export interface FilePort {readonly size:number;text():Promise<string>;}
export interface BlobPort {readonly size:number;arrayBuffer():Promise<ArrayBuffer>;}
export interface BrowserElement extends Omit<PresentationElement,'querySelector'|'append'|'replaceChildren'|'onclick'|'onkeydown'|'onchange'|'classList'|'scrollIntoView'> {
 get textContent():string|null;set textContent(value:unknown);
 get value():string;set value(value:unknown);
 readonly ownerDocument:BrowserDocument;id:string;className:string;title:string;src:string;alt:string;maxLength:number;open:boolean;
 width:number;height:number;readonly naturalWidth:number;readonly naturalHeight:number;
 innerHTML:string;readonly children:Iterable<BrowserElement>;readonly tagName:string;
 readonly parentNode:BrowserElement|null;readonly options?:readonly BrowserElement[];readonly selectedOptions?:readonly BrowserElement[];readonly files?:readonly FilePort[];
 readonly style:{[key:string]:string};classList:{toggle(name:string,force?:boolean):boolean;add(...names:string[]):void;remove(...names:string[]):void;contains(name:string):boolean;};
 onchange:((event:BrowserEvent)=>unknown)|null;onclick:((event:BrowserEvent)=>unknown)|null;onkeydown:((event:BrowserEvent)=>unknown)|null;
 oninput:((event:BrowserEvent)=>unknown)|null;onfocus:((event:BrowserEvent)=>unknown)|null;onpointerdown:((event:BrowserEvent)=>unknown)|null;
 onpointermove:((event:BrowserEvent)=>unknown)|null;onpointerup:((event:BrowserEvent)=>unknown)|null;onpointercancel:((event:BrowserEvent)=>unknown)|null;
 onwheel:((event:BrowserEvent)=>unknown)|null;ondblclick:((event:BrowserEvent)=>unknown)|null;
 setAttribute(name:string,value:unknown):void;
 append(...children:BrowserElement[]):void;replaceChildren(...children:BrowserElement[]):void;
 querySelector(selector:string):BrowserElement|null;querySelectorAll(selector:string):Iterable<BrowserElement>;
 addEventListener(name:string,listener:(event:BrowserEvent)=>unknown,options?:unknown):void;
 getBoundingClientRect():{left:number;top:number;width:number;height:number};setPointerCapture(id:number):void;releasePointerCapture(id:number):void;
 scrollIntoView(options?:{block:string}):void;focus():void;showModal():void;close():void;decode():Promise<void>;
 getContext(kind:'2d',options?:{willReadFrequently?:boolean}):CanvasContext|null;toBlob(callback:(blob:BlobPort|null)=>void,type:string):void;
}
export interface BrowserDocument extends Omit<PresentationDocument,'getElementById'|'createElement'> {
 getElementById(id:string):BrowserElement|null;createElement(tag:string):BrowserElement;createElementNS(namespace:string,tag:string):BrowserElement;
 readonly body:BrowserElement;readonly hidden:boolean;querySelector(selector:string):BrowserElement|null;querySelectorAll(selector:string):Iterable<BrowserElement>;
 addEventListener(name:string,listener:(event:BrowserEvent)=>unknown):void;
}
export interface CanvasContext {
 fillStyle:string;strokeStyle:string;lineWidth:number;font:string;textAlign:string;textBaseline:string;globalAlpha:number;
 save():void;restore():void;beginPath():void;closePath():void;stroke():void;fill():void;setLineDash(values:readonly number[]):void;
 moveTo(x:number,y:number):void;lineTo(x:number,y:number):void;arc(x:number,y:number,radius:number,start:number,end:number):void;
 strokeRect(x:number,y:number,w:number,h:number):void;fillRect(x:number,y:number,w:number,h:number):void;clearRect(x:number,y:number,w:number,h:number):void;
 fillText(text:string,x:number,y:number):void;strokeText(text:string,x:number,y:number):void;measureText(text:string):{width:number};
 translate(x:number,y:number):void;scale(x:number,y:number):void;setTransform(a:number,b:number,c:number,d:number,e:number,f:number):void;
 drawImage(image:BrowserElement,x:number,y:number,width?:number,height?:number):void;
 getImageData(x:number,y:number,width:number,height:number):ImagePixels;putImageData(data:ImagePixels,x:number,y:number):void;
}
export interface ImagePixels {readonly data:Uint8ClampedArray;readonly width:number;readonly height:number;}
export interface BrowserEnvironment {
 readonly document?:BrowserDocument;setTimeout?(callback:()=>void,milliseconds:number):unknown;clearTimeout?(id:unknown):void;
 readonly performance?:{now():number};readonly crypto?:{randomUUID():string;subtle?:{digest(name:string,bytes:Uint8Array):Promise<ArrayBuffer>}};
 addEventListener?(name:string,callback:(event:BrowserEvent)=>unknown):void;
}
export interface BrowserBlobConstructor {new(parts:readonly (string|Uint8Array)[],options:{type:string}):BlobPort;}
export interface BrowserImageConstructor {new():BrowserElement;}
export interface BrowserURL {createObjectURL(blob:BlobPort):string;revokeObjectURL(url:string):void;}
export interface BrowserTextEncoderConstructor {new():{encode(text:string):Uint8Array};}
