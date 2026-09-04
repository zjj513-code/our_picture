import { readFileSync, writeFileSync } from "node:fs";

const [input, output, apiHost] = process.argv.slice(2);
if (!input || !output || !apiHost) throw new Error("input, output and API host are required");
const config = JSON.parse(readFileSync(input, "utf8"));
const s3Origin = config.Origins.Items.find(({ Id }) => Id === "our-pictures-dev-web-s3");
const momentBehavior = config.CacheBehaviors.Items.find(({ PathPattern }) => PathPattern === "/moments/*");
if (!s3Origin || !momentBehavior) throw new Error("expected S3 origin and moment behavior");

const apiOrigin = {
  Id: "our-pictures-dev-api",
  DomainName: apiHost,
  OriginPath: "",
  CustomHeaders: { Quantity: 0 },
  CustomOriginConfig: {
    HTTPPort: 80,
    HTTPSPort: 443,
    OriginProtocolPolicy: "https-only",
    OriginSslProtocols: { Quantity: 1, Items: ["TLSv1.2"] },
    OriginReadTimeout: 30,
    OriginKeepaliveTimeout: 5
  },
  ConnectionAttempts: 3,
  ConnectionTimeout: 10,
  OriginShield: { Enabled: false },
  OriginAccessControlId: ""
};
const apiBehavior = {
  PathPattern: "/api/*",
  TargetOriginId: apiOrigin.Id,
  TrustedSigners: { Enabled: false, Quantity: 0 },
  TrustedKeyGroups: { Enabled: false, Quantity: 0 },
  ViewerProtocolPolicy: "redirect-to-https",
  AllowedMethods: { Quantity: 7, Items: ["HEAD", "DELETE", "POST", "GET", "OPTIONS", "PUT", "PATCH"], CachedMethods: { Quantity: 2, Items: ["HEAD", "GET"] } },
  SmoothStreaming: false,
  Compress: true,
  LambdaFunctionAssociations: { Quantity: 0 },
  FunctionAssociations: { Quantity: 0 },
  FieldLevelEncryptionId: "",
  CachePolicyId: "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
  OriginRequestPolicyId: "b689b0a8-53d0-40ab-baf2-68738e2966ac",
  GrpcConfig: { Enabled: false }
};

config.DefaultRootObject = "index.html";
config.Origins = { Quantity: 2, Items: [s3Origin, apiOrigin] };
config.DefaultCacheBehavior = { ...momentBehavior, TargetOriginId: s3Origin.Id };
delete config.DefaultCacheBehavior.PathPattern;
config.CacheBehaviors = { Quantity: 2, Items: [apiBehavior, momentBehavior] };
config.Comment = "Our Pictures static S3 + HTTP API serverless deployment";
writeFileSync(output, JSON.stringify(config, null, 2));
