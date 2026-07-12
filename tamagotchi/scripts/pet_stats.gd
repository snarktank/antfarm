class_name PetStats
extends RefCounted

const DECAY_HUNGER: float = 0.5       # points per second
const DECAY_HAPPINESS: float = 0.4
const DECAY_ENERGY: float = 0.2       # energy drains slower
const DECAY_CLEANLINESS: float = 0.3

var hunger: float = 80.0
var happiness: float = 80.0
var energy: float = 80.0
var cleanliness: float = 80.0

func apply_decay(delta_seconds: float) -> void:
	hunger = clampf(hunger - DECAY_HUNGER * delta_seconds, 0.0, 100.0)
	happiness = clampf(happiness - DECAY_HAPPINESS * delta_seconds, 0.0, 100.0)
	energy = clampf(energy - DECAY_ENERGY * delta_seconds, 0.0, 100.0)
	cleanliness = clampf(cleanliness - DECAY_CLEANLINESS * delta_seconds, 0.0, 100.0)

func to_dict() -> Dictionary:
	return {
		"hunger": hunger,
		"happiness": happiness,
		"energy": energy,
		"cleanliness": cleanliness,
	}

func from_dict(data: Dictionary) -> void:
	hunger = clampf(float(data.get("hunger", 80.0)), 0.0, 100.0)
	happiness = clampf(float(data.get("happiness", 80.0)), 0.0, 100.0)
	energy = clampf(float(data.get("energy", 80.0)), 0.0, 100.0)
	cleanliness = clampf(float(data.get("cleanliness", 80.0)), 0.0, 100.0)
