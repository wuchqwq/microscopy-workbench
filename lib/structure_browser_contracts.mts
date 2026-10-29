// The small API surface actually used from the optional pinned renderer and
// the fixed viewer HTML. It is not a replacement renderer or a chemistry model.
import type {CartesianCell,StructureSnapshot,ViewerAPIResponse} from './structure_snapshot_contracts.mjs';
export interface ContactPolicy {readonly atom_budget:number;readonly undirected_contact_budget:number;}
export type InspectContacts=(atoms:unknown,structure:StructureSnapshot,policy:ContactPolicy)=>number;
export interface RenderAtom {elem:string;x:number;y:number;z:number;serial:number;bonds:number[];bondOrder:number[];}
export interface RendererModel {
 addAtoms(atoms:RenderAtom[]):void;setCrystMatrix(matrix:unknown):void;
 assignBonds():void;selectedAtoms(selection:Record<string,never>):unknown[];removeAtoms(atoms:unknown[]):void;
}
export interface RendererViewer {
 addModel():RendererModel;setStyle(selection:Record<string,never>,style:unknown):void;
 addUnitCell(model:RendererModel,options:unknown):void;addArrow(options:unknown):void;
 zoomTo():void;render():void;getView():number[];setView(view:number[]):void;
 setViewChangeCallback(callback:()=>void):void;resize():void;
}
export interface RendererLibrary {
 createViewer(element:string,options:{backgroundColor:string}):RendererViewer;
 Matrix3:new(...values:number[])=>unknown;
}
interface TextElement {textContent:string|null;onclick:(()=>void)|null;}
interface SelectElement extends TextElement {value:string;disabled:boolean;onchange:(()=>void)|null;}
export interface ViewerElements {
 'camera-state':TextElement;'contact-state':TextElement;'viewer-status':TextElement;
 'contact-summary':TextElement;'display-mode':SelectElement;reset:TextElement;
 summary:TextElement;message:TextElement;
}
export interface ViewerDocument {getElementById(id:string):TextElement|SelectElement|null;}
export interface ViewerLocation {hash:string;pathname:string;}
export interface ViewerStorage {setItem(key:string,value:string):void;getItem(key:string):string|null;}
export interface ViewerHistory {replaceState(data:unknown,unused:string,url:string):void;}
export interface ViewerWindow {addEventListener(type:'resize',callback:()=>void):void;}
export interface BrowserRendererGlobal {$3Dmol?:RendererLibrary;}
export interface ViewerFetchResponse {readonly ok:boolean;json():Promise<unknown>;}
export type ViewerFetch=(url:string,options:{headers:Record<string,string|null>})=>Promise<ViewerFetchResponse>;
export type ViewerContacts = {state:'not_computed';contact_count:null} | {state:'ready';contact_count:number} | {state:'refused';contact_count:number|null;reason:string};
export type {ViewerAPIResponse,CartesianCell};
