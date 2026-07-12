extends Object

const PetStats = preload("res://scripts/pet_stats.gd")
const SaveSystem = preload("res://scripts/save_system.gd")

const SAVE_FILE = "tamagotchi_save.json"
const SAVE_PATH = "user://tamagotchi_save.json"

func _delete_save() -> void:
	var dir := DirAccess.open("user://")
	if dir and dir.file_exists(SAVE_FILE):
		dir.remove(SAVE_FILE)

func test_save_load_roundtrip() -> Variant:
	_delete_save()
	var sys := SaveSystem.new()
	var stats := PetStats.new()
	stats.hunger = 60.0
	stats.happiness = 70.0
	stats.energy = 55.0
	stats.cleanliness = 45.0
	sys.save(stats)

	var loaded := sys.load()
	# Elapsed between save and load is milliseconds — allow 1 point of decay margin
	if abs(loaded.hunger - 60.0) > 1.0:
		return "roundtrip hunger mismatch: %s" % loaded.hunger
	if abs(loaded.happiness - 70.0) > 1.0:
		return "roundtrip happiness mismatch: %s" % loaded.happiness
	if abs(loaded.energy - 55.0) > 1.0:
		return "roundtrip energy mismatch: %s" % loaded.energy
	if abs(loaded.cleanliness - 45.0) > 1.0:
		return "roundtrip cleanliness mismatch: %s" % loaded.cleanliness
	return true

func test_offline_decay_applied() -> Variant:
	# Write a save file manually with saved_at 100 seconds in the past
	var stats := PetStats.new()
	stats.hunger = 80.0
	stats.happiness = 80.0
	stats.energy = 80.0
	stats.cleanliness = 80.0

	var past_time := Time.get_unix_time_from_system() - 100.0
	var data: Dictionary = stats.to_dict()
	data["saved_at"] = past_time

	var file := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if not file:
		return "could not write test save file"
	file.store_string(JSON.stringify(data))
	file.close()

	var sys := SaveSystem.new()
	var loaded := sys.load()

	# After ~100s decay: hunger = 80 - 0.5*100 = 30, allow ±2 for timing jitter
	var expected_hunger := maxf(80.0 - PetStats.DECAY_HUNGER * 100.0, 0.0)
	if abs(loaded.hunger - expected_hunger) > 2.0:
		return "offline decay hunger wrong: expected ~%s got %s" % [expected_hunger, loaded.hunger]

	var expected_happiness := maxf(80.0 - PetStats.DECAY_HAPPINESS * 100.0, 0.0)
	if abs(loaded.happiness - expected_happiness) > 2.0:
		return "offline decay happiness wrong: expected ~%s got %s" % [expected_happiness, loaded.happiness]

	var expected_energy := maxf(80.0 - PetStats.DECAY_ENERGY * 100.0, 0.0)
	if abs(loaded.energy - expected_energy) > 2.0:
		return "offline decay energy wrong: expected ~%s got %s" % [expected_energy, loaded.energy]

	var expected_cleanliness := maxf(80.0 - PetStats.DECAY_CLEANLINESS * 100.0, 0.0)
	if abs(loaded.cleanliness - expected_cleanliness) > 2.0:
		return "offline decay cleanliness wrong: expected ~%s got %s" % [expected_cleanliness, loaded.cleanliness]

	return true

func test_missing_file_returns_defaults() -> Variant:
	_delete_save()
	var sys := SaveSystem.new()
	var loaded := sys.load()
	if loaded.hunger != 80.0:
		return "missing file: hunger should be 80 got %s" % loaded.hunger
	if loaded.happiness != 80.0:
		return "missing file: happiness should be 80 got %s" % loaded.happiness
	if loaded.energy != 80.0:
		return "missing file: energy should be 80 got %s" % loaded.energy
	if loaded.cleanliness != 80.0:
		return "missing file: cleanliness should be 80 got %s" % loaded.cleanliness
	return true

func test_corrupt_file_returns_defaults() -> Variant:
	var file := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if not file:
		return "could not write corrupt test file"
	file.store_string("not valid json {{{{")
	file.close()

	var sys := SaveSystem.new()
	var loaded := sys.load()
	if loaded.hunger != 80.0:
		return "corrupt file: hunger should be 80 got %s" % loaded.hunger
	if loaded.happiness != 80.0:
		return "corrupt file: happiness should be 80 got %s" % loaded.happiness
	return true
