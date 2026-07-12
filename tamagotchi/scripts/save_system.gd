class_name SaveSystem
extends RefCounted

const SAVE_PATH = "user://tamagotchi_save.json"
const PetStats = preload("res://scripts/pet_stats.gd")

func save(stats: PetStats) -> void:
	var data: Dictionary = stats.to_dict()
	data["saved_at"] = Time.get_unix_time_from_system()
	var file := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(data))
		file.close()

func load() -> PetStats:
	var stats := PetStats.new()
	if not FileAccess.file_exists(SAVE_PATH):
		return stats

	var file := FileAccess.open(SAVE_PATH, FileAccess.READ)
	if not file:
		return stats

	var json_str := file.get_as_text()
	file.close()

	var json := JSON.new()
	if json.parse(json_str) != OK:
		return stats

	var data = json.data
	if not data is Dictionary:
		return stats

	stats.from_dict(data)

	var now := Time.get_unix_time_from_system()
	var saved_at := float(data.get("saved_at", now))
	var elapsed := maxf(now - saved_at, 0.0)
	if elapsed > 0.0:
		stats.apply_decay(elapsed)

	return stats
