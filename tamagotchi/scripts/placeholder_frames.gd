# Generates procedural placeholder SpriteFrames for all creature states.
# No external art assets required — all frames built from Image pixel operations.

class_name PlaceholderFrames
extends RefCounted

const FRAME_SIZE := 128

static func build() -> SpriteFrames:
	var sf := SpriteFrames.new()
	if sf.has_animation("default"):
		sf.remove_animation("default")

	sf.add_animation("idle")
	_add_idle_frames(sf)

	sf.add_animation("happy")
	_add_happy_frames(sf)

	sf.add_animation("sad")
	_add_sad_frames(sf)

	sf.add_animation("sleeping")
	_add_sleeping_frames(sf)

	sf.add_animation("eating")
	_add_eating_frames(sf)

	sf.add_animation("playing")
	_add_playing_frames(sf)

	return sf

static func _make_image() -> Image:
	var img := Image.create(FRAME_SIZE, FRAME_SIZE, false, Image.FORMAT_RGBA8)
	img.fill(Color(0.0, 0.0, 0.0, 0.0))
	return img

static func _fill_circle(img: Image, cx: int, cy: int, r: int, color: Color) -> void:
	var x0 := maxi(0, cx - r)
	var x1 := mini(FRAME_SIZE - 1, cx + r)
	var y0 := maxi(0, cy - r)
	var y1 := mini(FRAME_SIZE - 1, cy + r)
	for y in range(y0, y1 + 1):
		for x in range(x0, x1 + 1):
			if (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r:
				img.set_pixel(x, y, color)

static func _add_idle_frames(sf: SpriteFrames) -> void:
	# Neutral blue creature, slight bob between two frames
	var offsets := [2, -2]
	for i in 2:
		var img := _make_image()
		var oy: int = offsets[i]
		_fill_circle(img, 64, 70 + oy, 35, Color(0.4, 0.6, 0.9))
		_fill_circle(img, 64, 42 + oy, 28, Color(0.5, 0.7, 1.0))
		_fill_circle(img, 55, 38 + oy, 5,  Color(0.1, 0.1, 0.1))
		_fill_circle(img, 73, 38 + oy, 5,  Color(0.1, 0.1, 0.1))
		sf.add_frame("idle", ImageTexture.create_from_image(img))

static func _add_happy_frames(sf: SpriteFrames) -> void:
	# Bright yellow, bouncy jump
	var offsets := [4, -4]
	for i in 2:
		var img := _make_image()
		var oy: int = offsets[i]
		_fill_circle(img, 64, 70 + oy, 36, Color(1.0, 0.85, 0.1))
		_fill_circle(img, 64, 40 + oy, 30, Color(1.0, 0.90, 0.2))
		_fill_circle(img, 54, 36 + oy, 6,  Color(0.1, 0.1, 0.1))
		_fill_circle(img, 74, 36 + oy, 6,  Color(0.1, 0.1, 0.1))
		# Smile arc
		for px in range(54, 76):
			var py: int = 52 + oy + roundi(3.0 * sin(float(px - 54) / 21.0 * PI))
			if px >= 0 and px < FRAME_SIZE and py >= 0 and py < FRAME_SIZE:
				img.set_pixel(px, py, Color(0.2, 0.1, 0.0))
		sf.add_frame("happy", ImageTexture.create_from_image(img))

static func _add_sad_frames(sf: SpriteFrames) -> void:
	# Dark gray-blue, droopy — sag increases on second frame
	var droops := [3, 5]
	for i in 2:
		var img := _make_image()
		_fill_circle(img, 64, 75, 33, Color(0.35, 0.40, 0.50))
		_fill_circle(img, 64, 46, 26, Color(0.40, 0.45, 0.55))
		img.fill_rect(Rect2i(49, 40 + droops[i], 10, 4), Color(0.1, 0.1, 0.15))
		img.fill_rect(Rect2i(67, 40 + droops[i], 10, 4), Color(0.1, 0.1, 0.15))
		sf.add_frame("sad", ImageTexture.create_from_image(img))

static func _add_sleeping_frames(sf: SpriteFrames) -> void:
	# Dim lavender, closed eyes, Z bubble alternates size
	for i in 2:
		var img := _make_image()
		_fill_circle(img, 64, 78, 32, Color(0.55, 0.50, 0.70))
		_fill_circle(img, 64, 52, 26, Color(0.60, 0.55, 0.75))
		img.fill_rect(Rect2i(50, 48, 12, 3), Color(0.2, 0.1, 0.3))
		img.fill_rect(Rect2i(66, 48, 12, 3), Color(0.2, 0.1, 0.3))
		var z_size: int = 8 + i * 4
		img.fill_rect(Rect2i(80, 30 - i * 4, z_size, z_size), Color(0.8, 0.8, 1.0, 0.6))
		sf.add_frame("sleeping", ImageTexture.create_from_image(img))

static func _add_eating_frames(sf: SpriteFrames) -> void:
	# Warm orange, mouth open on first frame, closed on second; food item present
	for i in 2:
		var img := _make_image()
		_fill_circle(img, 64, 70, 34, Color(0.90, 0.55, 0.20))
		_fill_circle(img, 64, 44, 28, Color(1.00, 0.65, 0.30))
		_fill_circle(img, 54, 40, 5,  Color(0.1, 0.1, 0.1))
		_fill_circle(img, 74, 40, 5,  Color(0.1, 0.1, 0.1))
		if i == 0:
			_fill_circle(img, 64, 58, 7, Color(0.5, 0.1, 0.0))
		else:
			img.fill_rect(Rect2i(56, 56, 16, 4), Color(0.3, 0.1, 0.0))
		img.fill_rect(Rect2i(72, 52, 10, 10), Color(0.3, 0.7, 0.2))
		sf.add_frame("eating", ImageTexture.create_from_image(img))

static func _add_playing_frames(sf: SpriteFrames) -> void:
	# Bright green, lean left/right with a bouncing ball
	var leans := [-6, 6]
	for i in 2:
		var img := _make_image()
		var lx: int = leans[i]
		_fill_circle(img, 64 + lx, 72, 32, Color(0.30, 0.80, 0.40))
		_fill_circle(img, 64 + lx, 46, 26, Color(0.40, 0.90, 0.50))
		_fill_circle(img, 55 + lx, 42,  5, Color(0.1, 0.1, 0.1))
		_fill_circle(img, 73 + lx, 42,  5, Color(0.1, 0.1, 0.1))
		_fill_circle(img, 90 - lx * 2, 80, 8, Color(1.0, 0.3, 0.3))
		sf.add_frame("playing", ImageTexture.create_from_image(img))
