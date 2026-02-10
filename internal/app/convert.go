package app

import (
	"fmt"

	"github.com/dop251/goja"
)

// Convert runs the embedded converter JS and returns the converted output.
func Convert(input, converterJS string) (string, error) {
	vm := goja.New()
	_, err := vm.RunString(converterJS)
	if err != nil {
		return "", fmt.Errorf("run converter: %w", err)
	}
	var convertInputToOutput func(string) string
	if err := vm.ExportTo(vm.Get("convertInputToOutput"), &convertInputToOutput); err != nil {
		return "", fmt.Errorf("export convertInputToOutput: %w", err)
	}
	return convertInputToOutput(input), nil
}
