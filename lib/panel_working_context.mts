// Read-only presentation scope. This does not authenticate or execute science.
type Row=Readonly<Record<string,unknown>>;
export function panelWorkingContext(object:Row,selection:Row|null,edit:Row){
 const marks=Array.isArray(object.annotations)?object.annotations:[];
 const sameSaved=Boolean(selection&&marks.some(raw=>{const m=raw as Row,a=m.anchor as Row|undefined;return m.status!=='retracted'&&m.kind===selection.kind&&a?.coordinate_space===selection.coordinate_space&&a?.source_object_id===selection.source_object_id&&Array.isArray(a?.coordinates)&&Array.isArray(selection.coordinates)&&a.coordinates.length===selection.coordinates.length&&a.coordinates.every((n,i)=>n===(selection.coordinates as unknown[])[i]);}));
 return {png:'saved_immutable_view',selection:selection?'current_selected_scope':'none',selection_is_uncommitted:Boolean(selection&&!sameSaved),draft_dirty:edit.dirty===true,gesture_active:edit.gesture_active===true,semantic:'Read current ROI handoff and draft_revision; saved PNG excludes newer local edits. Recheck exact view/draft before image_panel_show. A proposed region is not user confirmation.'};
}
