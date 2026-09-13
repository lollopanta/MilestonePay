import bpy

def build_4x_plate():
    # Clear existing objects
    bpy.ops.wm.read_factory_settings(use_empty=True)

    input_stl = "/Users/lollopanta/.superset/projects/MilestonePay/apps/web/public/stl/Keychain_Complete.stl"
    out_stl_web = "/Users/lollopanta/.superset/projects/MilestonePay/apps/web/public/stl/Keychain_4x_Plate.stl"
    out_stl_hub = "/Users/lollopanta/stampante-3d-urbe-hub/progetti/milestone-pay/stl/Keychain_4x_Plate.stl"

    # Positions for 4 keychains in 1 vertical column
    # Keychain bounds relative to its origin (0,0,0):
    # X: -50 to +40 (width 90mm, center offset is at X=0, but span is [-50, 40])
    # To center X span [-50, 40] on X_center = 87.5 mm:
    # Midpoint of [-50, 40] is -5.0.
    # So X position = 87.5 - (-5.0) = 92.5 mm.
    # Let's verify: at X_pos = 92.5 mm, X_min = 92.5 - 50 = 42.5 mm, X_max = 92.5 + 40 = 132.5 mm.
    # Total X span on bed = [42.5, 132.5], mid = 87.5 mm! Perfect!

    x_pos = 92.5
    y_positions = [27.0, 69.0, 111.0, 153.0]

    objs = []
    for i, y_pos in enumerate(y_positions):
        bpy.ops.wm.stl_import(filepath=input_stl)
        imported = bpy.context.selected_objects[0]
        imported.name = f"Keychain_{i+1}"
        imported.location = (x_pos, y_pos, 0.0)
        objs.append(imported)

    # Select all and join
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objs:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()

    joined_obj = bpy.context.active_object
    joined_obj.name = "Keychain_4x_Plate"

    # Export STL
    bpy.ops.wm.stl_export(filepath=out_stl_web, export_selected_objects=True)
    bpy.ops.wm.stl_export(filepath=out_stl_hub, export_selected_objects=True)

    print("Successfully exported 4x plate STL to web and hub paths!")

if __name__ == "__main__":
    build_4x_plate()
