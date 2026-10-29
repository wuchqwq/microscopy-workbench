// Browser-safe contracts for validated presentation copies, not scientific qualification.
declare const structureIdentity: unique symbol;
export type StructureObjectId = string & {readonly [structureIdentity]: 'saved-structure-object'};
export type NumericTriple = [number,number,number];
export type CartesianAngstromVector = NumericTriple & {readonly [structureIdentity]:'cartesian-angstrom'};
export type XYZDegrees = NumericTriple & {readonly [structureIdentity]:'display-xyz-degrees'};
export type CartesianCell = [CartesianAngstromVector,CartesianAngstromVector,CartesianAngstromVector];
export type NumericMatrix3 = [NumericTriple,NumericTriple,NumericTriple];
export type CartesianRotation = NumericMatrix3 & {readonly [structureIdentity]:'proper-source-to-lab-rotation'};
export interface AppliedDisplayOrientation {
 orientation_id: StructureObjectId; rotation_matrix_cartesian: CartesianRotation;
 source_coordinates_sha256: string; initial_orientation_applied: true;
 scientific_source_coordinates_modified: false; display_coordinates_transformed: true; convention: string;
}
export interface UnappliedDisplayOrientation {
 initial_orientation_applied: false; scientific_source_coordinates_modified: false;
 display_coordinates_transformed: false; requested_rotation_deg_xyz: XYZDegrees;
 convention: string; reason: string;
}
export type DisplayOrientation = AppliedDisplayOrientation | UnappliedDisplayOrientation;
export interface StructureCoordinates {
 object_id: StructureObjectId; symbols: string[]; positions_angstrom: CartesianAngstromVector[];
 cell_angstrom: CartesianCell; pbc: [boolean,boolean,boolean]; display_orientation?: DisplayOrientation;
}
export interface StructureSnapshot extends StructureCoordinates {
 coordinate_unit: 'angstrom'; cell_vectors: 'rows in the same Cartesian frame as atom positions';
 cell_drawn: boolean; cell_display: 'full_cell'|'declared_periodic_vectors_only'|'none';
 periodic_cell_axes: number[]; atom_count: number;
}

export interface ViewerRenderer {
 name:string; version:string; license:string; asset_sha256:string; mode:string;
}
export interface ViewerAPIResponse {schema_version:1;structure:StructureSnapshot;snapshot_sha256:string;renderer:ViewerRenderer;read_only:true;}
