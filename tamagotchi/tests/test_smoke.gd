extends Object

func test_true_is_true() -> bool:
	return true

func test_basic_math() -> Variant:
	if 1 + 1 != 2:
		return "expected 1 + 1 == 2"
	return true

func test_string_operations() -> Variant:
	var s := "tamagotchi"
	if not s.begins_with("tamago"):
		return "expected string to begin with 'tamago'"
	return true
