extends Object

const PetStats = preload("res://scripts/pet_stats.gd")
const PetInteractions = preload("res://scripts/interactions.gd")
const CreatureStateMachine = preload("res://scripts/creature_state_machine.gd")
const SaveSystem = preload("res://scripts/save_system.gd")
const PetHUD = preload("res://scripts/hud.gd")
const MainScript = preload("res://scripts/main.gd")

# AC: main.gd compiles and loads without error
func test_main_script_loads() -> Variant:
	if MainScript == null:
		return "main.gd failed to preload"
	return true

# AC: feed interaction raises hunger stat
func test_feed_raises_hunger() -> Variant:
	var stats := PetStats.new()
	stats.hunger = 50.0
	var interactions := PetInteractions.new()
	var now := 1000.0
	var ok := interactions.perform("feed", stats, now)
	if not ok:
		return "perform('feed') returned false"
	if stats.hunger <= 50.0:
		return "hunger did not increase: " + str(stats.hunger)
	return true

# AC: feed path drives state machine to EATING animation
func test_feed_triggers_eating_animation() -> Variant:
	var stats := PetStats.new()
	stats.hunger = 50.0
	var interactions := PetInteractions.new()
	var sm := CreatureStateMachine.new()
	var now := 1000.0
	interactions.perform("feed", stats, now)
	sm.trigger_action("feed", now)
	var anim := sm.animation_name(stats, now + 0.1)
	if anim != "eating":
		return "expected 'eating', got: " + anim
	return true

# AC: play interaction raises happiness and triggers playing animation
func test_play_raises_happiness_and_triggers_playing() -> Variant:
	var stats := PetStats.new()
	stats.happiness = 50.0
	var interactions := PetInteractions.new()
	var sm := CreatureStateMachine.new()
	var now := 2000.0
	var ok := interactions.perform("play", stats, now)
	if not ok:
		return "perform('play') returned false"
	if stats.happiness <= 50.0:
		return "happiness did not increase: " + str(stats.happiness)
	sm.trigger_action("play", now)
	var anim := sm.animation_name(stats, now + 0.1)
	if anim != "playing":
		return "expected 'playing', got: " + anim
	return true

# AC: HUD button signal → interaction → stat update (end-to-end signal wiring)
func test_hud_feed_signal_wires_to_interaction() -> Variant:
	var stats := PetStats.new()
	stats.hunger = 50.0
	var interactions := PetInteractions.new()
	var hud := PetHUD.new()
	var now := 3000.0

	hud.action_feed.connect(func():
		interactions.perform("feed", stats, now)
	)
	# Simulate button press via signal emit
	hud.btn_feed.pressed.emit()

	if stats.hunger <= 50.0:
		return "hunger did not rise after simulated feed button press"
	return true

# AC: save writes JSON file with stat data
func test_save_writes_json_file() -> Variant:
	var stats := PetStats.new()
	stats.hunger = 65.0
	var ss := SaveSystem.new()
	ss.save(stats)
	if not FileAccess.file_exists(SaveSystem.SAVE_PATH):
		return "save file not created at " + SaveSystem.SAVE_PATH
	var file := FileAccess.open(SaveSystem.SAVE_PATH, FileAccess.READ)
	if not file:
		return "could not open save file"
	var content := file.get_as_text()
	file.close()
	if not content.contains("hunger"):
		return "save file missing 'hunger' key"
	return true

# AC: load applies offline decay
func test_load_applies_offline_decay() -> Variant:
	var stats := PetStats.new()
	stats.hunger = 80.0
	var ss := SaveSystem.new()

	# Write save file with timestamp 60 seconds in the past
	var data := stats.to_dict()
	data["saved_at"] = Time.get_unix_time_from_system() - 60.0
	var file := FileAccess.open(SaveSystem.SAVE_PATH, FileAccess.WRITE)
	if not file:
		return "could not write backdated save"
	file.store_string(JSON.stringify(data))
	file.close()

	var loaded := ss.load()
	# 60s * 0.5/s = 30 points decay minimum; hunger must be below 80
	if loaded.hunger >= 80.0:
		return "offline decay not applied, hunger still " + str(loaded.hunger)
	return true

# AC: stat-machine enters SAD state when a stat is critically low after decay
func test_decay_drives_sad_state() -> Variant:
	var stats := PetStats.new()
	stats.hunger = 5.0   # critically low
	var sm := CreatureStateMachine.new()
	var now := 4000.0
	var anim := sm.animation_name(stats, now)
	if anim != "sad":
		return "expected 'sad' for critical hunger, got: " + anim
	return true
