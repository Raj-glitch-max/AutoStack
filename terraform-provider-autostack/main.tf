terraform {
  required_providers {
    autostack = {
      source  = "autostack/autostack"
      version = "1.0.0"
    }
  }
}

provider "autostack" {
  api_token = "dummy-dev-token"
}

resource "autostack_cloud_credential" "aws" {
  display_name = "AWS Test"
  provider     = "aws"
  account_id   = "123456789"
}

resource "autostack_environment" "staging" {
  name                = "staging"
  repo_url            = "https://github.com/myorg/api"
  environment         = "staging"
  size                = "small"
  cloud_credential_id = autostack_cloud_credential.aws.id
}
