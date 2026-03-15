// Package main redirects to the cmd/agent entry point.
//
// The production entry point is cmd/agent/main.go.
// Use: go run ./cmd/agent/
//
// This file exists to satisfy `go build .` at the module root.
package main

import (
	"fmt"
	"os"
)

func main() {
	fmt.Fprintln(os.Stderr, "Use: go run ./cmd/agent/")
	fmt.Fprintln(os.Stderr, "The root main.go is a placeholder — the agent entry point is cmd/agent/main.go")
	os.Exit(1)
}
