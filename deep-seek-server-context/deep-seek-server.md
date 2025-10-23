# DeepSeek R1 Model Server

A serverless infrastructure solution for hosting DeepSeek R1 models using AWS Bedrock, Lambda (Go), and API Gateway. This setup provides a scalable, cost-effective way to serve DeepSeek R1 models with REST API endpoints.

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│                 │    │                 │    │                 │    │                 │
│   Client/App    │───▶│  API Gateway    │───▶│  Lambda         │───▶│  AWS Bedrock    │
│                 │    │  (REST API)     │    │  (Go Runtime)   │    │  (DeepSeek R1)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Components

- **AWS API Gateway**: REST API endpoint with CORS support
- **AWS Lambda**: Serverless Go function for handling requests and interfacing with Bedrock
- **AWS Bedrock**: Managed AI service hosting DeepSeek R1 models
- **CloudWatch**: Logging and monitoring
- **S3**: Storage for Lambda deployment packages

## 🚀 Quick Start

### Prerequisites

1. **AWS Account** with appropriate permissions
2. **Terraform** >= 1.0 installed
3. **Go** >= 1.21 installed
4. **Make** utility installed
5. **AWS CLI** configured with credentials
6. **DeepSeek R1 model access** in AWS Bedrock (see [Model Access](#model-access))

### Model Access

Before deploying, ensure you have access to DeepSeek R1 models in AWS Bedrock:

1. Navigate to AWS Bedrock console
2. Go to "Model access" in the left sidebar
3. Request access to DeepSeek models if not already enabled
4. Wait for approval (usually takes a few minutes)

### Deployment

1. **Clone and setup**:
   ```bash
   git clone <your-repo>
   cd miniapps-ai-mcp-server
   ```

2. **Configure variables**:
   ```bash
   cp terraform.tfvars.example terraform.tfvars
   # Edit terraform.tfvars with your preferred settings
   ```

3. **Build and deploy**:
   ```bash
   # Option 1: Use the deployment script (recommended)
   ./scripts/deploy.sh
   
   # Option 2: Manual deployment
   make build
   terraform init
   terraform plan
   terraform apply
   ```

4. **Get your API endpoint**:
   ```bash
   terraform output api_gateway_url
   ```

## 🔧 Configuration

### Available DeepSeek R1 Models

| Model ID | Description | Parameters |
|----------|-------------|------------|
| `deepseek.deepseek-r1-distill-llama-70b-v1` | Large model, best performance | 70B |
| `deepseek.deepseek-r1-distill-qwen-32b-v1` | Medium model, balanced performance | 32B |
| `deepseek.deepseek-r1-distill-qwen-14b-v1` | Smaller model, faster responses | 14B |
| `deepseek.deepseek-r1-distill-qwen-7b-v1` | Compact model, lowest cost | 7B |
| `deepseek.deepseek-r1-distill-llama-8b-v1` | Compact model, Llama-based | 8B |

### Key Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `aws_region` | AWS region for deployment | `us-east-1` |
| `deepseek_model_id` | DeepSeek R1 model to use | `deepseek.deepseek-r1-distill-llama-70b-v1` |
| `enable_api_key_auth` | Enable API key authentication | `false` |
| `lambda_timeout` | Lambda timeout in seconds | `300` |

## 📡 API Usage

### Endpoint

```
POST https://<api-gateway-url>/chat
```

### Request Format

```json
{
  "message": "Your question or prompt here",
  "max_tokens": 1000,
  "temperature": 0.7,
  "top_p": 0.9,
  "system_prompt": "You are a helpful AI assistant."
}
```

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `message` | string | Yes | - | The user's input message |
| `max_tokens` | integer | No | 1000 | Maximum tokens to generate (1-4000) |
| `temperature` | float | No | 0.7 | Sampling temperature (0.0-2.0) |
| `top_p` | float | No | 0.9 | Nucleus sampling parameter (0.0-1.0) |
| `system_prompt` | string | No | "You are a helpful AI assistant." | System prompt to guide the model |

### Response Format

```json
{
  "message": "The AI's response",
  "model": "deepseek.deepseek-r1-distill-llama-70b-v1",
  "usage": {
    "input_tokens": 50,
    "output_tokens": 150
  },
  "input_tokens": 50,
  "output_tokens": 150
}
```

### Example Usage

#### Basic Request

```bash
curl -X POST https://your-api-gateway-url/chat \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: abcdefg" \\
  -d "{\"message\": \"can you tell me a story?\"}"
```

#### Advanced Request with Parameters

```bash
curl -X POST https://your-api-gateway-url/chat \\
  -H "Content-Type: application/json" \\
  -d '{
    "message": "Write a Python function to calculate fibonacci numbers",
    "max_tokens": 500,
    "temperature": 0.3,
    "system_prompt": "You are an expert Python developer. Write clean, well-documented code."
  }'
```

#### Using Go Test Client

```bash
# Build and run the test client
cd examples
go run test_api.go -endpoint "https://your-api-gateway-url/chat" -message "Hello, DeepSeek R1!"

# With API key
go run test_api.go -endpoint "https://your-api-gateway-url/chat" -api-key "your-key" -message "Hello!"
```

#### With API Key (if authentication enabled)

```bash
curl -X POST https://your-api-gateway-url/chat \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: your-api-key-here" \\
  -d '{
    "message": "Hello, DeepSeek R1!"
  }'
```

## 🔐 Security

### API Key Authentication

To enable API key authentication, set `enable_api_key_auth = true` in your `terraform.tfvars`:

```hcl
enable_api_key_auth = true
api_quota_limit = 1000    # Daily quota
api_rate_limit = 10       # Requests per second
api_burst_limit = 20      # Burst capacity
```

After deployment, retrieve your API key:

```bash
terraform output api_key_value
```

### IAM Permissions

The Lambda function uses minimal required permissions:
- `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream`
- CloudWatch Logs permissions for monitoring

## 📊 Monitoring

### CloudWatch Logs

Lambda function logs are available in CloudWatch:

```bash
# Get log group name
terraform output cloudwatch_log_group

# View logs with AWS CLI
aws logs tail /aws/lambda/deepseek-server-deepseek-function --follow
```

### Metrics

Monitor your deployment through CloudWatch metrics:
- **Lambda Duration**: Execution time per request
- **Lambda Errors**: Failed invocations
- **API Gateway 4XX/5XX**: Client and server errors
- **API Gateway Count**: Request volume

## 💰 Cost Optimization

### Model Selection

Choose the appropriate model based on your needs:
- **70B models**: Best quality, highest cost
- **32B models**: Good balance of quality and cost
- **14B/8B/7B models**: Lower cost, suitable for simpler tasks

### Regional Deployment

Deploy in regions where Bedrock costs are lower and closer to your users.

### Rate Limiting

Use API key authentication with rate limits to control costs:

```hcl
enable_api_key_auth = true
api_rate_limit = 5        # Lower rate for cost control
api_quota_limit = 500     # Daily limit
```

## 🔧 Troubleshooting

### Common Issues

1. **"Model not found" error**
   - Ensure you have access to the DeepSeek model in Bedrock
   - Check that the model ID is correct for your region

2. **"Insufficient permissions" error**
   - Verify AWS credentials have necessary permissions
   - Check IAM role policies are correctly attached

3. **Lambda timeout**
   - Increase `lambda_timeout` variable
   - Consider using a smaller model for faster responses

4. **API Gateway 403 errors**
   - Check if API key authentication is enabled but key not provided
   - Verify CORS configuration for browser requests

### Debug Mode

Enable debug mode for detailed error messages:

```bash
aws lambda update-function-configuration \\
  --function-name $(terraform output -raw lambda_function_name) \\
  --environment Variables='{MODEL_ID=your-model-id,REGION=your-region,DEBUG=true}'
```

## 🚀 Advanced Usage

### Custom System Prompts

Use system prompts to customize the AI's behavior:

```json
{
  "message": "What's the weather like?",
  "system_prompt": "You are a helpful weather assistant. Always ask for the user's location if not provided."
}
```

### Streaming Responses

For future implementations, the infrastructure supports streaming responses via `bedrock:InvokeModelWithResponseStream`.

### Multiple Environments

Deploy to multiple environments by using different variable files:

```bash
# Production
terraform apply -var-file="prod.tfvars"

# Staging
terraform apply -var-file="staging.tfvars"
```

## 🧹 Cleanup

To destroy all resources:

```bash
terraform destroy
```

**Note**: This will permanently delete all resources including S3 buckets and their contents.

## 📝 License

This project is open source. Please check the license file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📞 Support

For issues and questions:
1. Check the [troubleshooting section](#troubleshooting)
2. Review CloudWatch logs
3. Open an issue in the repository

## 🔗 Resources

- [AWS Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- [DeepSeek R1 Model Documentation](https://docs.deepseek.com/)
- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [API Gateway REST API](https://docs.aws.amazon.com/apigateway/latest/developerguide/rest-api.html)
