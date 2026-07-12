extends Object

const PetStats = preload("res://scripts/pet_stats.gd")

func test_defaults() -> Variant:
	var s := PetStats.new()
	if s.hunger != 80.0:
		return "hunger default should be 80, got %s" % s.hunger
	if s.happiness != 80.0:
		return "happiness default should be 80, got %s" % s.happiness
	if s.energy != 80.0:
		return "energy default should be 80, got %s" % s.energy
	if s.cleanliness != 80.0:
		return "cleanliness default should be 80, got %s" % s.cleanliness
	return true

func test_apply_decay_reduces_stats() -> Variant:
	var s := PetStats.new()
	s.apply_decay(10.0)
	var expected_hunger := 80.0 - PetStats.DECAY_HUNGER * 10.0
	var expected_happiness := 80.0 - PetStats.DECAY_HAPPINESS * 10.0
	var expected_energy := 80.0 - PetStats.DECAY_ENERGY * 10.0
	var expected_cleanliness := 80.0 - PetStats.DECAY_CLEANLINESS * 10.0
	if abs(s.hunger - expected_hunger) > 0.001:
		return "hunger after 10s wrong: expected %s got %s" % [expected_hunger, s.hunger]
	if abs(s.happiness - expected_happiness) > 0.001:
		return "happiness after 10s wrong: expected %s got %s" % [expected_happiness, s.happiness]
	if abs(s.energy - expected_energy) > 0.001:
		return "energy after 10s wrong: expected %s got %s" % [expected_energy, s.energy]
	if abs(s.cleanliness - expected_cleanliness) > 0.001:
		return "cleanliness after 10s wrong: expected %s got %s" % [expected_cleanliness, s.cleanliness]
	return true

func test_clamp_at_zero() -> Variant:
	var s := PetStats.new()
	s.apply_decay(10000.0)
	if s.hunger != 0.0:
		return "hunger should clamp to 0, got %s" % s.hunger
	if s.happiness != 0.0:
		return "happiness should clamp to 0, got %s" % s.happiness
	if s.energy != 0.0:
		return "energy should clamp to 0, got %s" % s.energy
	if s.cleanliness != 0.0:
		return "cleanliness should clamp to 0, got %s" % s.cleanliness
	return true

func test_to_dict_from_dict_roundtrip() -> Variant:
	var s := PetStats.new()
	s.hunger = 42.5
	s.happiness = 55.0
	s.energy = 10.0
	s.cleanliness = 99.9
	var d := s.to_dict()
	var s2 := PetStats.new()
	s2.from_dict(d)
	if abs(s2.hunger - 42.5) > 0.001:
		return "roundtrip hunger mismatch: %s" % s2.hunger
	if abs(s2.happiness - 55.0) > 0.001:
		return "roundtrip happiness mismatch: %s" % s2.happiness
	if abs(s2.energy - 10.0) > 0.001:
		return "roundtrip energy mismatch: %s" % s2.energy
	if abs(s2.cleanliness - 99.9) > 0.001:
		return "roundtrip cleanliness mismatch: %s" % s2.cleanliness
	return true

func test_from_dict_clamps_overflow() -> Variant:
	var s := PetStats.new()
	s.from_dict({"hunger": 200.0, "happiness": -50.0, "energy": 150.0, "cleanliness": -1.0})
	if s.hunger != 100.0:
		return "overflow hunger should clamp to 100, got %s" % s.hunger
	if s.happiness != 0.0:
		return "negative happiness should clamp to 0, got %s" % s.happiness
	if s.energy != 100.0:
		return "overflow energy should clamp to 100, got %s" % s.energy
	if s.cleanliness != 0.0:
		return "negative cleanliness should clamp to 0, got %s" % s.cleanliness
	return true
