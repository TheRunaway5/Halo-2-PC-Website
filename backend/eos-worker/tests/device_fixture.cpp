// Explicit live qualification only. Creates an isolated EOS device-test user.
#include <eos_sdk.h>
#include <eos_connect.h>
#include <eos_logging.h>
#include <chrono>
#include <fstream>
#include <iostream>
#include <map>
#include <stdexcept>
#include <string>
#include <thread>
using enum EOS_EResult;
using enum EOS_EExternalCredentialType;
struct State { EOS_EResult result=EOS_UnexpectedError; bool done{}; EOS_ProductUserId user{}; EOS_ContinuanceToken continuation{}; };
int main(int argc,char** argv)try {
  if(argc!=3)return 2;
  std::map<std::string,std::string> config;
  std::ifstream input(argv[1]);
  for(std::string line;std::getline(input,line);){const auto at=line.find('=');if(at!=std::string::npos)config[line.substr(0,at)]=line.substr(at+1);}
  const auto get=[&](const char *key)->const char*{if(config[key].empty())throw std::runtime_error("Missing fixture configuration");return config.at(key).c_str();};
  EOS_InitializeOptions init{};init.ApiVersion=EOS_INITIALIZE_API_LATEST;init.ProductName="H2ForeverStatQualification";init.ProductVersion="1";
  if(EOS_Initialize(&init)!=EOS_Success)throw std::runtime_error("SDK init failed");
  EOS_Logging_SetCallback([](const EOS_LogMessage*){});
  EOS_Platform_Options options{};options.ApiVersion=EOS_PLATFORM_OPTIONS_API_LATEST;
  options.ProductId=get("H2_EOS_PRODUCT_ID");options.SandboxId=get("H2_EOS_SANDBOX_ID");options.DeploymentId=get("H2_EOS_DEPLOYMENT_ID");
  options.ClientCredentials.ClientId=get("H2_EOS_CLIENT_ID");options.ClientCredentials.ClientSecret=get("H2_EOS_CLIENT_SECRET");
  options.CacheDirectory=argv[2];options.Flags=EOS_PF_DISABLE_OVERLAY|EOS_PF_DISABLE_SOCIAL_OVERLAY;
  auto platform=EOS_Platform_Create(&options);if(!platform)throw std::runtime_error("Fixture platform failed");
  const auto connect=EOS_Platform_GetConnectInterface(platform);
  const auto wait=[&](State &state){const auto until=std::chrono::steady_clock::now()+std::chrono::seconds(25);
    while(!state.done&&std::chrono::steady_clock::now()<until){EOS_Platform_Tick(platform);std::this_thread::sleep_for(std::chrono::milliseconds(2));}
    if(!state.done)throw std::runtime_error("Fixture operation timed out");};
  State device;
  EOS_Connect_CreateDeviceIdOptions create{};create.ApiVersion=EOS_CONNECT_CREATEDEVICEID_API_LATEST;create.DeviceModel="H2ForeverStatQualification";
  EOS_Connect_CreateDeviceId(connect,&create,&device,[](const EOS_Connect_CreateDeviceIdCallbackInfo *r){auto &s=*static_cast<State*>(r->ClientData);s.result=r->ResultCode;s.done=true;});wait(device);
  if(device.result!=EOS_Success&&device.result!=EOS_DuplicateNotAllowed)throw std::runtime_error(EOS_EResult_ToString(device.result));
  State login;
  EOS_Connect_Credentials credential{};credential.ApiVersion=EOS_CONNECT_CREDENTIALS_API_LATEST;credential.Type=EOS_ECT_DEVICEID_ACCESS_TOKEN;
  EOS_Connect_UserLoginInfo user{};user.ApiVersion=EOS_CONNECT_USERLOGININFO_API_LATEST;user.DisplayName="H2ForeverStatQualification";
  EOS_Connect_LoginOptions request{};request.ApiVersion=EOS_CONNECT_LOGIN_API_LATEST;request.Credentials=&credential;request.UserLoginInfo=&user;
  EOS_Connect_Login(connect,&request,&login,[](const EOS_Connect_LoginCallbackInfo *r){auto &s=*static_cast<State*>(r->ClientData);s.result=r->ResultCode;s.user=r->LocalUserId;s.continuation=r->ContinuanceToken;s.done=true;});wait(login);
  if(login.result==EOS_InvalidUser){
    EOS_Connect_CreateUserOptions create_user{};create_user.ApiVersion=EOS_CONNECT_CREATEUSER_API_LATEST;create_user.ContinuanceToken=login.continuation;login.done=false;
    EOS_Connect_CreateUser(connect,&create_user,&login,[](const EOS_Connect_CreateUserCallbackInfo *r){auto &s=*static_cast<State*>(r->ClientData);s.result=r->ResultCode;s.user=r->LocalUserId;s.done=true;});wait(login);
  }
  if(login.result!=EOS_Success)throw std::runtime_error(EOS_EResult_ToString(login.result));
  char id[EOS_PRODUCTUSERID_MAX_LENGTH+1]{};int32_t size=sizeof(id);
  if(EOS_ProductUserId_ToString(login.user,id,&size)!=EOS_Success)throw std::runtime_error("Fixture ID unavailable");
  // Private parent pipe only; the validation report retains a hash, not this ID.
  std::cout<<"H2_TEST_USER "<<id<<std::endl;
  EOS_Platform_Release(platform);EOS_Shutdown();return 0;
}catch(const std::exception &e){std::cerr<<e.what()<<'\n';return 1;}
