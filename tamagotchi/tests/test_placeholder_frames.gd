extends Object

const PlaceholderFrames = preload("res://scripts/placeholder_frames.gd")

const EXPECTED_ANIMS: Array[String] = ["idle", "happy", "sad", "sleeping", "eating", "playing"]
const EXPECTED_SIZE := 128

func test_all_animations_present() -> Variant:
	var sf := PlaceholderFrames.build()
	for anim in EXPECTED_ANIMS:
		if not sf.has_animation(anim):
			return "missing animation: " + anim
	return true

func test_each_animation_has_at_least_one_frame() -> Variant:
	var sf := PlaceholderFrames.build()
	for anim in EXPECTED_ANIMS:
		if sf.get_frame_count(anim) < 1:
			return "animation has no frames: " + anim
	return true

func test_each_frame_texture_non_null() -> Variant:
	var sf := PlaceholderFrames.build()
	for anim in EXPECTED_ANIMS:
		var count := sf.get_frame_count(anim)
		for i in count:
			var tex := sf.get_frame_texture(anim, i)
			if tex == null:
				return "null texture in animation '%s' frame %d" % [anim, i]
	return true

func test_frame_textures_correct_size() -> Variant:
	var sf := PlaceholderFrames.build()
	for anim in EXPECTED_ANIMS:
		var count := sf.get_frame_count(anim)
		for i in count:
			var tex := sf.get_frame_texture(anim, i)
			if tex == null:
				return "null texture in animation '%s' frame %d" % [anim, i]
			if tex.get_width() != EXPECTED_SIZE or tex.get_height() != EXPECTED_SIZE:
				return "wrong size in animation '%s' frame %d: %dx%d" % [
					anim, i, tex.get_width(), tex.get_height()
				]
	return true

func test_no_default_animation_in_output() -> Variant:
	var sf := PlaceholderFrames.build()
	if sf.has_animation("default"):
		return "build() should remove the default animation"
	return true

func test_animation_count_is_exactly_six() -> Variant:
	var sf := PlaceholderFrames.build()
	var names := sf.get_animation_names()
	if names.size() != 6:
		return "expected 6 animations, got %d: %s" % [names.size(), str(names)]
	return true
