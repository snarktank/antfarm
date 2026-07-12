extends SceneTree

var _total := 0
var _passed := 0
var _failed := 0

func _init() -> void:
	var dir := DirAccess.open("res://tests/")
	if dir == null:
		print("ERROR: Cannot open res://tests/")
		quit(1)
		return

	var files: Array[String] = []
	dir.list_dir_begin()
	var fname := dir.get_next()
	while fname != "":
		if fname.begins_with("test_") and fname.ends_with(".gd"):
			files.append("res://tests/" + fname)
		fname = dir.get_next()
	dir.list_dir_end()
	files.sort()

	for path in files:
		_run_file(path)

	print("\n--- Results: %d/%d passed ---" % [_passed, _total])
	quit(0 if _failed == 0 else 1)

func _run_file(path: String) -> void:
	print("\nFile: " + path)
	var scr = load(path)
	if scr == null:
		print("  FAIL: could not load script")
		_failed += 1
		_total += 1
		return

	var obj = scr.new()
	for m in obj.get_method_list():
		var method_name: String = m["name"]
		if not method_name.begins_with("test_"):
			continue
		_total += 1
		var result = obj.call(method_name)
		if result == null or result == true:
			print("  PASS: " + method_name)
			_passed += 1
		else:
			print("  FAIL: " + method_name + " — " + str(result))
			_failed += 1
	obj.free()
