package provider

import (
	"context"
	"os"

	"github.com/autostack/terraform-provider-autostack/internal/client"
	"github.com/autostack/terraform-provider-autostack/internal/data_sources"
	"github.com/autostack/terraform-provider-autostack/internal/resources"
	"github.com/hashicorp/terraform-plugin-framework/datasource"
	"github.com/hashicorp/terraform-plugin-framework/provider"
	"github.com/hashicorp/terraform-plugin-framework/provider/schema"
	"github.com/hashicorp/terraform-plugin-framework/resource"
	"github.com/hashicorp/terraform-plugin-framework/types"
)

// Ensure provider defined type fully satisfies framework interfaces.
var _ provider.Provider = &autostackProvider{}

type autostackProvider struct {
	version string
}

type autostackProviderModel struct {
	APIToken types.String `tfsdk:"api_token"`
	APIURL   types.String `tfsdk:"api_url"`
}

func New(version string) func() provider.Provider {
	return func() provider.Provider {
		return &autostackProvider{
			version: version,
		}
	}
}

func (p *autostackProvider) Metadata(ctx context.Context, req provider.MetadataRequest, resp *provider.MetadataResponse) {
	resp.TypeName = "autostack"
	resp.Version = p.version
}

func (p *autostackProvider) Schema(ctx context.Context, req provider.SchemaRequest, resp *provider.SchemaResponse) {
	resp.Schema = schema.Schema{
		Attributes: map[string]schema.Attribute{
			"api_token": schema.StringAttribute{
				Optional:    true,
				Sensitive:   true,
				Description: "AutoStack API Token. Can also be sourced from AUTOSTACK_TOKEN.",
			},
			"api_url": schema.StringAttribute{
				Optional:    true,
				Description: "AutoStack API URL. Defaults to https://api.autostack.io/api/v1.",
			},
		},
	}
}

func (p *autostackProvider) Configure(ctx context.Context, req provider.ConfigureRequest, resp *provider.ConfigureResponse) {
	var data autostackProviderModel
	resp.Diagnostics.Append(req.Config.Get(ctx, &data)...)
	if resp.Diagnostics.HasError() {
		return
	}

	apiToken := os.Getenv("AUTOSTACK_TOKEN")
	if !data.APIToken.IsNull() && !data.APIToken.IsUnknown() {
		apiToken = data.APIToken.ValueString()
	}

	apiURL := "https://api.autostack.io/api/v1"
	if !data.APIURL.IsNull() && !data.APIURL.IsUnknown() {
		apiURL = data.APIURL.ValueString()
	}

	if apiToken == "" {
		resp.Diagnostics.AddError(
			"Missing API Token",
			"Please set the api_token provider configuration or the AUTOSTACK_TOKEN environment variable.",
		)
		return
	}

	c := client.NewClient(apiURL, apiToken)

	resp.DataSourceData = c
	resp.ResourceData = c
}

func (p *autostackProvider) Resources(ctx context.Context) []func() resource.Resource {
	return []func() resource.Resource{
		resources.NewEnvironmentResource,
		resources.NewCredentialResource,
		resources.NewDatabaseResource,
		resources.NewDomainResource,
		resources.NewTeamMemberResource,
	}
}

func (p *autostackProvider) DataSources(ctx context.Context) []func() datasource.DataSource {
	return []func() datasource.DataSource{
		data_sources.NewEnvironmentDataSource,
	}
}
