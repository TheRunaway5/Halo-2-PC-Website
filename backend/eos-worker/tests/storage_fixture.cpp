// Offline vendor-ABI boundary fixture. No real EOS platform or player exists.
#include <eos_sdk.h>
#include <eos_connect.h>
#include <eos_logging.h>
#include <eos_playerdatastorage.h>
#include <algorithm>
#include <cassert>
#include <cstdlib>
#include <cstdint>
#include <cstring>
#include <fstream>
#include <iostream>
#include <iterator>
#include <string>
using enum EOS_EResult;
template<class T> static T handle(unsigned n=1){return reinterpret_cast<T>(std::uintptr_t(n));}
static std::string scenario(){const char* p=std::getenv("H2_FRIEND_TEST_CASE");return p?p:"";}
static std::string remote;static unsigned writes{},reads{},clears{},logins{};
static bool exists{};
extern "C" {
EOS_EResult EOS_CALL EOS_Initialize(const EOS_InitializeOptions*){
  if(const char* path=std::getenv("H2_FRIEND_TEST_INITIAL_FILE")){
    std::ifstream stream(path);remote.assign(std::istreambuf_iterator<char>(stream),{});exists=true;
  }
  return EOS_Success;
}
EOS_EResult EOS_CALL EOS_Shutdown(){
  std::cout<<"H2TEST {\"writes\":"<<writes<<",\"reads\":"<<reads<<",\"clears\":"<<clears<<",\"logins\":"<<logins<<"}\n";
  return EOS_Success;
}
EOS_EResult EOS_CALL EOS_Logging_SetCallback(EOS_LogMessageFunc){return EOS_Success;}
EOS_HPlatform EOS_CALL EOS_Platform_Create(const EOS_Platform_Options* o){
  assert(!o->bIsServer && o->EncryptionKey && std::strlen(o->EncryptionKey)==64);return handle<EOS_HPlatform>();
}
void EOS_CALL EOS_Platform_Release(EOS_HPlatform){}
void EOS_CALL EOS_Platform_Tick(EOS_HPlatform){}
EOS_HStats EOS_CALL EOS_Platform_GetStatsInterface(EOS_HPlatform){return handle<EOS_HStats>();}
EOS_HLeaderboards EOS_CALL EOS_Platform_GetLeaderboardsInterface(EOS_HPlatform){return handle<EOS_HLeaderboards>();}
EOS_HConnect EOS_CALL EOS_Platform_GetConnectInterface(EOS_HPlatform){return handle<EOS_HConnect>();}
EOS_HPlayerDataStorage EOS_CALL EOS_Platform_GetPlayerDataStorageInterface(EOS_HPlatform){return handle<EOS_HPlayerDataStorage>();}
EOS_ProductUserId EOS_CALL EOS_ProductUserId_FromString(const char* p){return handle<EOS_ProductUserId>(p[0]=='a'?1:2);}
EOS_EResult EOS_CALL EOS_ProductUserId_ToString(EOS_ProductUserId p,char* output,int32_t* length){
  if(*length<33)return EOS_LimitExceeded;
  std::string text(32,p==handle<EOS_ProductUserId>()?'a':'b');std::memcpy(output,text.c_str(),33);*length=33;return EOS_Success;
}
void EOS_CALL EOS_Connect_Login(EOS_HConnect,const EOS_Connect_LoginOptions* o,void* data,EOS_Connect_OnLoginCallback cb){
  assert(o->Credentials->Type==EOS_EExternalCredentialType::EOS_ECT_OPENID_ACCESS_TOKEN);++logins;
  EOS_Connect_LoginCallbackInfo r{};r.ClientData=data;
  r.ResultCode=scenario()=="missing_binding"?EOS_InvalidUser:EOS_Success;
  r.LocalUserId=handle<EOS_ProductUserId>(scenario()=="wrong_user"?2:1);cb(&r);
}
void EOS_CALL EOS_Connect_CreateUser(EOS_HConnect,const EOS_Connect_CreateUserOptions*,void*,EOS_Connect_OnCreateUserCallback){std::abort();}
void EOS_CALL EOS_Connect_LinkAccount(EOS_HConnect,const EOS_Connect_LinkAccountOptions*,void*,EOS_Connect_OnLinkAccountCallback){std::abort();}
EOS_EResult EOS_CALL EOS_PlayerDataStorage_DeleteCache(EOS_HPlayerDataStorage,const EOS_PlayerDataStorage_DeleteCacheOptions* o,void* data,EOS_PlayerDataStorage_OnDeleteCacheCompleteCallback cb){
  assert(o->LocalUserId==handle<EOS_ProductUserId>());++clears;
  EOS_PlayerDataStorage_DeleteCacheCallbackInfo r{};r.ResultCode=EOS_Success;r.ClientData=data;r.LocalUserId=o->LocalUserId;cb(&r);return EOS_Success;
}
void EOS_CALL EOS_PlayerDataStorage_QueryFile(EOS_HPlayerDataStorage,const EOS_PlayerDataStorage_QueryFileOptions* o,void* data,EOS_PlayerDataStorage_OnQueryFileCompleteCallback cb){
  assert(o->LocalUserId==handle<EOS_ProductUserId>() && std::string(o->Filename)=="h2friends-v1.json");
  EOS_PlayerDataStorage_QueryFileCallbackInfo r{};r.ResultCode=exists?EOS_Success:EOS_NotFound;r.ClientData=data;r.LocalUserId=o->LocalUserId;cb(&r);
}
EOS_HPlayerDataStorageFileTransferRequest EOS_CALL EOS_PlayerDataStorage_ReadFile(EOS_HPlayerDataStorage,const EOS_PlayerDataStorage_ReadFileOptions* o,void* data,EOS_PlayerDataStorage_OnReadFileCompleteCallback cb){
  ++reads;auto status=EOS_Success;
  for(size_t at=0;at<remote.size();at+=7){
    EOS_PlayerDataStorage_ReadFileDataCallbackInfo r{};r.ClientData=data;
    r.LocalUserId=handle<EOS_ProductUserId>(scenario()=="wrong_read_user"?2:1);r.Filename=o->Filename;
    r.TotalFileSizeBytes=scenario()=="oversized"?32769:remote.size();r.DataChunkLengthBytes=std::min(size_t(7),remote.size()-at);
    r.DataChunk=remote.data()+at;r.bIsLastChunk=at+r.DataChunkLengthBytes==remote.size();
    if(o->ReadFileDataCallback(&r)!=EOS_PlayerDataStorage_EReadResult::EOS_RR_ContinueReading){status=EOS_UnexpectedError;break;}
  }
  EOS_PlayerDataStorage_ReadFileCallbackInfo done{};done.ClientData=data;done.LocalUserId=o->LocalUserId;done.Filename=o->Filename;done.ResultCode=status;cb(&done);
  return handle<EOS_HPlayerDataStorageFileTransferRequest>();
}
EOS_HPlayerDataStorageFileTransferRequest EOS_CALL EOS_PlayerDataStorage_WriteFile(EOS_HPlayerDataStorage,const EOS_PlayerDataStorage_WriteFileOptions* o,void* data,EOS_PlayerDataStorage_OnWriteFileCompleteCallback cb){
  assert(o->LocalUserId==handle<EOS_ProductUserId>() && std::string(o->Filename)=="h2friends-v1.json");++writes;
  std::string next;auto status=EOS_UnexpectedError;
  for(unsigned i=0;i<4096;++i){
    char buffer[29]{};uint32_t written{};EOS_PlayerDataStorage_WriteFileDataCallbackInfo r{};
    r.ClientData=data;r.LocalUserId=o->LocalUserId;r.Filename=o->Filename;r.DataBufferLengthBytes=sizeof(buffer);
    auto result=o->WriteFileDataCallback(&r,buffer,&written);assert(written<=sizeof(buffer));next.append(buffer,written);
    if(result==EOS_PlayerDataStorage_EWriteResult::EOS_WR_CompleteRequest){status=EOS_Success;break;}
    if(result!=EOS_PlayerDataStorage_EWriteResult::EOS_WR_ContinueWriting)break;
  }
  if(status==EOS_Success){remote=next;exists=true;if(scenario()=="changed_readback")remote+='\n';}
  EOS_PlayerDataStorage_WriteFileCallbackInfo done{};done.ClientData=data;done.LocalUserId=o->LocalUserId;done.Filename=o->Filename;done.ResultCode=status;cb(&done);
  return handle<EOS_HPlayerDataStorageFileTransferRequest>();
}
void EOS_CALL EOS_PlayerDataStorageFileTransferRequest_Release(EOS_HPlayerDataStorageFileTransferRequest){}
}
