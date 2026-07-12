extends Object

const PetStats = preload("res://scripts/pet_stats.gd")
const PetInteractions = preload("res://scripts/interactions.gd")
const PetHUD = preload("res://scripts/hud.gd")

# Helper: set all stats to a safe value above threshold
func _make_safe_stats() -> PetStats:
	var s := PetStats.new()
	s.hunger = 80.0
	s.happiness = 80.0
	s.energy = 80.0
	s.cleanliness = 80.0
	return s

func test_no_critical_stats_when_all_above_threshold() -> Variant:
	var stats := _make_safe_stats()
	var critical: Array = PetHUD.get_critical_stats(stats)
	if critical.size() != 0:
		return "Expected no critical stats, got: " + str(critical)
	return true

func test_stat_at_threshold_is_flagged() -> Variant:
	var stats := _make_safe_stats()
	stats.hunger = 20.0
	var critical: Array = PetHUD.get_critical_stats(stats)
	if not critical.has("hunger"):
		return "Expected hunger to be critical at 20.0"
	return true

func test_stat_below_threshold_is_flagged() -> Variant:
	var stats := _make_safe_stats()
	stats.happiness = 10.0
	var critical: Array = PetHUD.get_critical_stats(stats)
	if not critical.has("happiness"):
		return "Expected happiness to be critical at 10.0"
	return true

func test_stat_just_above_threshold_not_flagged() -> Variant:
	var stats := _make_safe_stats()
	stats.energy = 21.0
	var critical: Array = PetHUD.get_critical_stats(stats)
	if critical.has("energy"):
		return "Expected energy NOT critical at 21.0"
	return true

func test_multiple_critical_stats_all_returned() -> Variant:
	var stats := _make_safe_stats()
	stats.hunger = 5.0
	stats.cleanliness = 0.0
	var critical: Array = PetHUD.get_critical_stats(stats)
	if not critical.has("hunger"):
		return "Expected hunger in critical list"
	if not critical.has("cleanliness"):
		return "Expected cleanliness in critical list"
	if critical.has("happiness") or critical.has("energy"):
		return "happiness/energy should not be critical"
	return true

func test_hud_bar_turns_red_when_stat_critical() -> Variant:
	var hud := PetHUD.new()
	var stats := _make_safe_stats()
	stats.hunger = 15.0
	var interactions := PetInteractions.new()
	hud.update_display(stats, interactions, 0.0)

	var r: float = hud.bar_hunger.modulate.r
	var g: float = hud.bar_hunger.modulate.g
	var b: float = hud.bar_hunger.modulate.b
	hud.free()

	if r < 0.9 or g > 0.5 or b > 0.5:
		return "bar_hunger should be red when hunger=15 (r=" + str(r) + " g=" + str(g) + " b=" + str(b) + ")"
	return true

func test_hud_bar_not_red_when_stat_normal() -> Variant:
	var hud := PetHUD.new()
	var stats := _make_safe_stats()
	var interactions := PetInteractions.new()
	hud.update_display(stats, interactions, 0.0)

	var g: float = hud.bar_hunger.modulate.g
	var b: float = hud.bar_hunger.modulate.b
	hud.free()

	if g < 0.9 or b < 0.9:
		return "bar_hunger should be white/normal when hunger=80 (g=" + str(g) + " b=" + str(b) + ")"
	return true

func test_hud_bar_clears_warning_when_stat_recovers() -> Variant:
	var hud := PetHUD.new()
	var stats := _make_safe_stats()
	var interactions := PetInteractions.new()

	# First: set critical
	stats.hunger = 10.0
	hud.update_display(stats, interactions, 0.0)

	# Then: recover above threshold
	stats.hunger = 50.0
	hud.update_display(stats, interactions, 0.0)

	var g: float = hud.bar_hunger.modulate.g
	var b: float = hud.bar_hunger.modulate.b
	hud.free()

	if g < 0.9 or b < 0.9:
		return "Warning should clear when hunger recovers to 50.0 (g=" + str(g) + " b=" + str(b) + ")"
	return true
