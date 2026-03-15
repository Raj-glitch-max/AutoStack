package main

import (
	"context"
	"flag"
	"log"

	"github.com/autostack/terraform-provider-autostack/internal/provider"
	"github.com/hashicorp/terraform-plugin-framework/providerserver"
)

// Generate the Terraform provider documentation
//go:generate terraform plugin-docs --website-source-dir templates/ --website-temp-dir /tmp/tf-docs

func main() {
	var debug bool
	flag.BoolVar(&debug, "debug", false, "set to true to run the provider with support for debuggers like delve")
	flag.Parse()

	opts := providerserver.ServeOpts{
		Address: "registry.terraform.io/autostack/autostack",
		Debug:   debug,
	}

	err := providerserver.Serve(context.Background(), provider.New("1.0.0"), opts)
	if err != nil {
		log.Fatal(err.Error())
	}
}
